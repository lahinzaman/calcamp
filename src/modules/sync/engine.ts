import type { WorkoutRoutine } from '../workout/routines';
import { migrateImperialSnapshot } from './imperialMigration';
import { breadcrumb } from '../telemetry/events';
import type { ActivitySnapshot } from '../../api/activity';
import type { DailyTotals } from '../../api/trackingRepository';
import { emptyMacros, type MacroTotals, type MicronutrientTotals } from '../../types/nutrition';
import type { WorkoutState } from '../../store/workoutStore';
import type { HealthSummary, HealthWorkout, HealthMeal } from '../health/types';
import type { CompletedWorkout } from '../../types/workout';
import type { FoodEntry } from '../../types/foodEntry';
import type { LiftHistory, PersonalRecord, SessionVolumePoint } from '../workout/history';
import type { DurableStorage } from './storage';
export interface NutritionMutation { legacyMetricPatch?: { isAdherent?: boolean; bodyWeightKg?: number | null }; date: string; macros: MacroTotals; micros: MicronutrientTotals; patch: { isAdherent?: boolean; bodyWeightLbs?: number | null } }
export interface FoodEntryMutation { op: 'upsert' | 'delete'; entry: FoodEntry }
export type SyncPayload = { kind: 'routine'; data: WorkoutRoutine } | { kind: 'nutrition'; data: NutritionMutation } | { kind: 'workout'; data: CompletedWorkout }
  | { kind: 'workout-delete'; data: { sessionId: string } }
  | { kind: 'food-entry'; data: FoodEntryMutation }
  | { kind: 'health-workout'; data: HealthWorkout } | { kind: 'health-meal'; data: HealthMeal } | { kind: 'activity'; data: ActivitySnapshot };
export type Mutation = SyncPayload & { id: string; attempts: number; nextAttemptAt: number; blocked: boolean; error: string | null };
export interface AccountData {
  version: 2; routines?: WorkoutRoutine[]; days: Record<string, DailyTotals>; entries?: Record<string, FoodEntry[]>;
  lifts?: LiftHistory; volumeLog?: SessionVolumePoint[]; liftSessions?: string[]; lastRecords?: PersonalRecord[]; workout: WorkoutState | null; queue: Mutation[]; workoutReceipts: string[];
  health: { enabled: boolean; summary: HealthSummary | null; workouts: HealthWorkout[]; lastBatchAt: number | null; error: string | null; exported: string[] };
}
const fresh = (): AccountData => ({ version: 2, days: {}, entries: {}, lifts: {}, volumeLog: [], liftSessions: [], lastRecords: [], workout: null, queue: [], workoutReceipts: [], health: { enabled: false, summary: null, workouts: [], lastBatchAt: null, error: null, exported: [] } });
export function retryDelay(attempt: number, random = Math.random) { return Math.min(300_000, Math.round(1000 * 2 ** Math.min(attempt, 9) * (0.8 + random() * 0.4))); }
export function isPermanent(error: unknown) {
  const e = error as { code?: string; status?: number };
  return !!e?.code && /^(22|23|P000|42501|PGRST20|HEALTH_PERMISSION)/.test(e.code) || [400, 403, 404, 409, 422].includes(e?.status ?? 0);
}
export function applyDelta(day: DailyTotals, mutation: NutritionMutation): DailyTotals {
  const macros = { ...day.consumedMacros }; const micros = { ...day.consumedMicros };
  for (const k of Object.keys(macros) as (keyof MacroTotals)[]) macros[k] = Math.max(0, macros[k] + mutation.macros[k]);
  for (const k of Object.keys(mutation.micros) as (keyof MicronutrientTotals)[]) micros[k] = Math.max(0, (micros[k] ?? 0) + mutation.micros[k]!);
  return { ...day, consumedMacros: macros, consumedMicros: micros, ...mutation.patch };
}
export class SyncEngine {
  owner: string | null = null;
  lastAckAt: number | null = null;
  revision = 0;
  data = fresh(); online = true; syncing = false; storageError: string | null = null;
  private generation = 0; private activeDrain: Promise<void> | null = null;
  constructor(private storage: DurableStorage, private send: (owner: string, job: Mutation) => Promise<DailyTotals | void>,
    private changed: () => void = () => {}, private now = Date.now, private random = Math.random) {}
  activate(owner: string | null) {
    if (this.owner === owner) return;
    const raw = owner ? this.storage.get(`account:${owner}`) : null;
    const data: AccountData = raw ? migrateImperialSnapshot(JSON.parse(raw)) as AccountData : fresh();
    if (data.version !== 2 || !Array.isArray(data.queue) || !data.days || !data.health) throw new Error('Offline storage needs recovery. Local data has been preserved.');
    data.workoutReceipts ??= []; data.entries ??= {}; data.lifts ??= {}; data.volumeLog ??= []; data.liftSessions ??= []; data.lastRecords ??= [];
    this.lastAckAt = null; this.generation++; this.revision++; this.owner = owner; this.data = data; this.storageError = null; this.changed();
  }
  commit(data: AccountData) {
    if (!this.owner) return;
    try { this.storage.set(`account:${this.owner}`, JSON.stringify(data)); this.storageError = null; }
    catch { this.storageError = 'Device storage is full or unavailable. This edit could not be saved.'; this.changed(); throw new Error(this.storageError); }
    this.data = data; this.revision++; this.changed();
  }
  queue(payload: SyncPayload, id: string, update: Partial<AccountData> = {}) {
    if (!this.owner) return;
    if (this.data.queue.some(q => q.id === id) || this.data.health.exported.includes(id) || this.data.workoutReceipts.includes(id)) return;
    breadcrumb('sync.queued', { count: this.data.queue.length + 1 });
    this.commit({ ...this.data, ...update, queue: [...this.data.queue.filter(q => !(payload.kind === 'activity' && q.kind === 'activity' && q.data.date === payload.data.date && q.data.source === payload.data.source)), { ...payload, id, attempts: 0, nextAttemptAt: 0, blocked: false, error: null }] });
  }
  recordNutrition(next: DailyTotals, previous: DailyTotals, id: string) {
    const old = next.date === previous.date ? previous : { ...previous, consumedMacros: emptyMacros(), consumedMicros: {}, isAdherent: false, bodyWeightLbs: null };
    const macros = emptyMacros(); const micros: MicronutrientTotals = {}; const patch: NutritionMutation['patch'] = {};
    for (const k of Object.keys(macros) as (keyof MacroTotals)[]) macros[k] = next.consumedMacros[k] - old.consumedMacros[k];
    for (const k of new Set([...Object.keys(old.consumedMicros), ...Object.keys(next.consumedMicros)]) as Set<keyof MicronutrientTotals>) {
      const delta = (next.consumedMicros[k] ?? 0) - (old.consumedMicros[k] ?? 0); if (delta || (!(k in old.consumedMicros) && k in next.consumedMicros)) micros[k] = delta;
    }
    if (next.isAdherent !== old.isAdherent) patch.isAdherent = next.isAdherent;
    if (next.bodyWeightLbs !== old.bodyWeightLbs) patch.bodyWeightLbs = next.bodyWeightLbs;
    const days = { ...this.data.days, [next.date]: next };
    if (Object.values(macros).some(Boolean) || Object.keys(micros).length || Object.keys(patch).length) this.queue({ kind: 'nutrition', data: { date: next.date, macros, micros, patch } }, id, { days });
    else this.commit({ ...this.data, days });
  }
  /** Entry rows are their own records; the aggregate totals still sync as nutrition deltas. */
  recordEntries(date: string, next: FoodEntry[], previous: FoodEntry[]) {
    if (!this.owner || next === previous) return;
    const before = new Map(previous.map(e => [e.id, e]));
    const after = new Map(next.map(e => [e.id, e]));
    const changed: FoodEntryMutation[] = [];
    for (const entry of next) {
      const old = before.get(entry.id);
      if (!old || JSON.stringify(old) !== JSON.stringify(entry)) changed.push({ op: 'upsert', entry });
    }
    for (const entry of previous) if (!after.has(entry.id)) changed.push({ op: 'delete', entry });
    const entries = { ...this.data.entries, [date]: next };
    if (!changed.length) { this.commit({ ...this.data, entries }); return; }
    // A superseded edit for the same row is dropped: the newest payload already carries the final state.
    const superseded = new Set(changed.map(c => `food-entry:${c.entry.id}`));
    const queue = this.data.queue.filter(q => !(q.kind === 'food-entry' && superseded.has(`food-entry:${q.data.entry.id}`)));
    this.commit({ ...this.data, entries, queue: [...queue, ...changed.map(data => ({
      kind: 'food-entry' as const, data, id: `food-entry:${data.entry.id}:${data.op}:${this.now()}`,
      attempts: 0, nextAttemptAt: 0, blocked: false, error: null,
    }))] });
  }
  setOnline(online: boolean) { this.online = online; this.changed(); if (online) void this.drain(); }
  retryBlocked() { this.commit({ ...this.data, queue: this.data.queue.map(q => ({ ...q, blocked: false, nextAttemptAt: 0, error: null })) }); return this.drain(); }
  /** Never discard user edits implicitly. The UI requires a deliberate discard action. */
  discard(id: string, remote?: DailyTotals) {
    const job = this.data.queue.find(q => q.id === id);
    if (!job?.blocked) throw new Error('Only a blocked edit can be discarded.');
    if (job.kind === 'nutrition' && remote?.date !== job.data.date) throw new Error('Reload this diary day before discarding.');
    const queue = this.data.queue.filter(q => q.id !== id);
    const data = { ...this.data, queue };
    if (remote) data.days = { ...data.days, [remote.date]: queue.filter(q => q.kind === 'nutrition' && q.data.date === remote.date).reduce((day, q) => applyDelta(day, (q as Extract<Mutation, { kind: 'nutrition' }>).data), remote) };
    if (job.kind === 'workout' && data.workout) data.workout = { ...data.workout, pendingWorkouts: data.workout.pendingWorkouts.filter(p => p.workout.session.id !== job.data.session.id) };
    this.commit(data);
  }
  mergeRemoteIfUnchanged(day: DailyTotals, revision: number) {
    if (this.revision !== revision) return false;
    this.mergeRemote(day); return true;
  }
  mergeRemote(day: DailyTotals) {
    const merged = this.data.queue.filter(q => q.kind === 'nutrition' && q.data.date === day.date).reduce((value, q) => applyDelta(value, (q as Extract<Mutation, { kind: 'nutrition' }>).data), day);
    this.commit({ ...this.data, days: { ...this.data.days, [day.date]: merged } });
  }
  drain(): Promise<void> {
    if (this.activeDrain) return this.activeDrain;
    this.activeDrain = this.run().finally(() => { this.activeDrain = null; });
    return this.activeDrain;
  }
  private async run() {
    if (!this.owner || !this.online) return;
    const owner = this.owner; const generation = this.generation; this.syncing = true; this.changed(); breadcrumb('sync.syncing', { count: this.data.queue.length });
    try {
      for (let sent = 0; sent < 30 && this.online && this.owner === owner && generation === this.generation; sent++) {
        // Nutrition for each day must stay in order; a failed edit cannot be overtaken.
        const job = this.data.queue.find((q, i, queue) => !q.blocked && q.nextAttemptAt <= this.now()
          && !(q.kind === 'nutrition' && queue.slice(0, i).some(p => p.kind === 'nutrition' && p.data.date === q.data.date)));
        if (!job) break;
        try {
          const result = await this.send(owner, job);
          if (generation !== this.generation || this.owner !== owner) return;
          const data = { ...this.data, queue: this.data.queue.filter(q => q.id !== job.id) };
          if (job.kind === 'workout') data.workoutReceipts = [...data.workoutReceipts, job.id];
          if (job.kind.startsWith('health-')) data.health = { ...data.health, exported: [...data.health.exported, job.id] };
          if (job.kind === 'workout' && data.workout) data.workout = { ...data.workout, pendingWorkouts: data.workout.pendingWorkouts.filter(p => p.workout.session.id !== job.data.session.id) };
          // Ack and merged snapshot are one disk commit, so a crash cannot replay a delta locally.
          if (result && job.kind === 'nutrition') {
            const merged = data.queue.filter(q => q.kind === 'nutrition' && q.data.date === result.date).reduce((day, q) => applyDelta(day, (q as Extract<Mutation, { kind: 'nutrition' }>).data), result);
            data.days = { ...data.days, [result.date]: merged };
          }
          this.commit(data); breadcrumb('sync.synced', { count: data.queue.length }); this.lastAckAt = this.now(); this.changed();
        } catch (error) {
          if (generation !== this.generation) return;
          const blocked = isPermanent(error); breadcrumb(blocked ? 'sync.conflict' : 'sync.retry', { count: this.data.queue.length }); const attempts = job.attempts + 1;
          const message = blocked ? 'An edit needs review before it can sync.' : 'Connection interrupted. Your edits are saved on this device.';
          try { this.commit({ ...this.data, queue: this.data.queue.map(q => q.id === job.id ? { ...q, attempts, blocked, error: message, nextAttemptAt: this.now() + retryDelay(attempts, this.random) } : q) }); }
          catch { break; } // Disk failure must not spin or remove the original mutation.
        }
      }
    } finally { this.syncing = false; this.changed(); }
  }
}
