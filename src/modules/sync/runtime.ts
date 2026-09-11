import { randomUUID } from 'expo-crypto';
import { nutritionStore, localDateKey } from '../../store/nutritionStore';
import { workoutStore } from '../../store/workoutStore';
import { useSyncStatus } from '../../store/syncStore';
import { getTrackingRepository, type DailyTotals } from '../../api/trackingRepository';
import { getSupabase } from '../../api/supabase';
import { emptyMacros } from '../../types/nutrition';
import { durableStorage } from './storage';
import { SyncEngine } from './engine';
import { healthStore } from '../health/useHealthSync';
import { syncBridge } from './bridge';
import { rememberFood } from '../foods/savedFoods';
import type { FoodEntry } from '../../types/foodEntry';

/** Every logging path feeds recents from one place, so the second log of a food is one tap. */
function rememberNewFoods(owner: string, next: FoodEntry[], previous: FoodEntry[]) {
  const seen = new Set(previous.map(entry => entry.id));
  for (const entry of next) {
    // Quick adds and water are one-off amounts, not foods worth offering again.
    if (seen.has(entry.id) || entry.source === 'quick') continue;
    try { rememberFood(owner, { name: entry.name, servingLabel: entry.servingLabel, macros: entry.referenceMacros, micros: entry.referenceMicros, source: entry.source }); }
    catch { /* recents are a convenience; never block a log */ }
  }
}
let applying = false;
const daily = (s: DailyTotals): DailyTotals => ({ date: s.date, consumedMacros: s.consumedMacros, consumedMicros: s.consumedMicros, isAdherent: s.isAdherent, bodyWeightLbs: s.bodyWeightLbs });
export const syncEngine = new SyncEngine(durableStorage, async (owner, job) => {
  const { data } = await getSupabase().auth.getSession();
  if (data.session?.user.id !== owner) throw new Error('Sign in to resume synchronization.');
  if (job.kind === 'health-workout' || job.kind === 'health-meal') {
    const { getHealthAdapter } = await import('../health/healthAdapter'); const adapter = await getHealthAdapter();
    // A granted foreground connection is required; background code never prompts.
    if (syncEngine.owner !== owner) throw new Error('Account changed.');
    if (!syncEngine.data.health.enabled) throw new Error('Connect health to resume exports.');
    if (job.kind === 'health-workout') await adapter.writeWorkout({ ...job.data, id: job.id }); else await adapter.writeDietaryEnergy({ ...job.data, id: job.id });
    return;
  }
  if (job.kind === 'activity') {
    const { readPreferences } = await import('../notifications/preferences');
    if (readPreferences(owner).uploadActivity) await (await import('../../api/activity')).saveActivitySnapshot(owner, job.data);
    return;
  }
  if (job.kind === 'routine') { await (await import('../../api/routines')).saveRoutine(owner, job.data); return; }
  if (job.kind === 'food-entry') {
    const entries = await import('../../api/foodEntries');
    if (job.data.op === 'delete') await entries.deleteFoodEntry(owner, job.data.entry.id); else await entries.saveFoodEntry(owner, job.data.entry);
    return;
  }
  const repository = await getTrackingRepository();
  if (job.kind === 'nutrition') {
    if (!repository.applyNutritionMutation) throw new Error('Update the sync repository.');
    return repository.applyNutritionMutation(owner, job.id, job.data);
  }
  await repository.saveWorkout(owner, job.data);
}, () => {
  const state = syncEngine;
  useSyncStatus.setState({ online: state.online, queued: state.data.queue.length, blocked: state.data.queue.filter(q => q.blocked).length,
    syncing: state.syncing, error: state.storageError ?? state.data.queue.find(q => q.error)?.error ?? null,
    lastSyncedAt: state.lastAckAt });
});
function applySnapshot() {
  if (!syncEngine.owner) return;
  applying = true;
  try {
    const date = localDateKey(new Date()); const snapshot = syncEngine.data.days[date];
    const entries = syncEngine.data.entries?.[date] ?? [];
    if (snapshot) nutritionStore.setState({ ...snapshot, entries, cloudOwnerId: syncEngine.owner, syncStatus: 'idle', syncError: null });
    else if (entries.length) nutritionStore.setState({ entries });
    if (syncEngine.data.workout) workoutStore.setState(syncEngine.data.workout);
    workoutStore.setState({ importedWorkouts: syncEngine.data.health.workouts });
  } finally { applying = false; }
}
export async function drainSync() { await syncEngine.drain(); applySnapshot(); }
export async function refreshDiary() {
  const owner = syncEngine.owner; if (!owner) return;
  try {
    await drainSync(); if (owner !== syncEngine.owner) return;
    const date = localDateKey(new Date());
    // A lost acknowledgement may already exist in cloud totals; wait for its receipt retry.
    if (syncEngine.data.queue.some(q => q.kind === 'nutrition' && q.data.date === date && q.attempts > 0)) return;
    const revision = syncEngine.revision;
    const remote = await (await getTrackingRepository()).loadDay(owner, date);
    if (owner !== syncEngine.owner) return;
    if (!syncEngine.mergeRemoteIfUnchanged(remote ?? { date, consumedMacros: emptyMacros(), consumedMicros: {}, bodyWeightLbs: null, isAdherent: false }, revision)) return;
    applySnapshot(); syncEngine.lastAckAt = Date.now(); useSyncStatus.setState({ lastSyncedAt: syncEngine.lastAckAt, error: null });
  } catch { useSyncStatus.setState({ error: 'Cloud is unavailable. Your saved device diary is still available.' }); }
}
export function activateSync(owner: string | null) {
  useSyncStatus.setState({ ready: false, lastSyncedAt: null });
  // Disable capture while switching accounts; old queues remain isolated on disk.
  syncBridge.nutrition = undefined; syncBridge.workout = undefined; syncBridge.drain = undefined; syncBridge.refresh = undefined;
  nutritionStore.getState().reset(); workoutStore.getState().reset(); healthStore.getState().reset();
  syncEngine.activate(owner); durableStorage.set('active-sync-owner', owner ?? '');
  if (!owner) { useSyncStatus.setState({ ready: false, queued: 0, blocked: 0, error: null }); return; }
  applySnapshot();
  if (syncEngine.data.health.enabled) healthStore.setState({ ...(syncEngine.data.health.summary?.date === localDateKey(new Date()) ? syncEngine.data.health.summary : {}), initialized: true, refreshedAt: syncEngine.data.health.lastBatchAt });
  syncBridge.nutrition = (next, previous) => {
    if (applying || !syncEngine.owner) return;
    const a = daily(next); const b = daily(previous);
    if (JSON.stringify(a) !== JSON.stringify(b)) syncEngine.recordNutrition(a, b, randomUUID());
    const before = previous.date === next.date ? previous.entries : [];
    syncEngine.recordEntries(next.date, next.entries, before);
    rememberNewFoods(syncEngine.owner, next.entries, before);
  };
  syncBridge.workout = next => {
    if (applying || !syncEngine.owner) return;
    const detached = JSON.parse(JSON.stringify(next));
    const data = { ...syncEngine.data, workout: detached };
    // Draft and all new completed sessions enter the same atomic SQLite write.
    for (const pending of next.pendingWorkouts) {
      const id = `workout:${pending.workout.session.id}`;
      if (!data.workoutReceipts.includes(id) && !data.queue.some(q => q.id === id)) data.queue = [...data.queue, { id, kind: 'workout', data: pending.workout, attempts: 0, nextAttemptAt: 0, blocked: false, error: null }];
      const healthId = `health-workout:${syncEngine.owner}:${pending.workout.session.id}`;
      if (data.health.enabled && !data.health.exported.includes(healthId) && !data.queue.some(q => q.id === healthId)) data.queue = [...data.queue, { id: healthId, kind: 'health-workout',
        data: { id: healthId, name: pending.workout.session.name, start: new Date(pending.workout.session.startedAtMs).toISOString(), end: new Date(pending.workout.endedAtMs).toISOString() }, attempts: 0, nextAttemptAt: 0, blocked: false, error: null }];
    }
    syncEngine.commit(data);
  };
  syncBridge.drain = drainSync; syncBridge.refresh = refreshDiary;
  useSyncStatus.setState({ ready: true });
}

/** Fetch first; an unavailable cloud must never erase the user's queued edit. */
export async function discardBlockedEdit(id: string) {
  const owner = syncEngine.owner;
  if (!owner || !syncEngine.online) throw new Error('Reconnect before discarding.');
  const job = syncEngine.data.queue.find(q => q.id === id);
  if (!job?.blocked) throw new Error('This edit no longer needs review.');
  let remote: DailyTotals | undefined;
  if (job.kind === 'nutrition') remote = await (await getTrackingRepository()).loadDay(owner, job.data.date)
    ?? { date: job.data.date, consumedMacros: emptyMacros(), consumedMicros: {}, bodyWeightLbs: null, isAdherent: false };
  if (owner !== syncEngine.owner) throw new Error('Account changed.');
  syncEngine.discard(id, remote); applySnapshot();
}
