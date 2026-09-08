import type { HealthAdapter, HealthSummary, HealthWorkout } from '../health/types';
import { syncEngine } from './runtime';
import { workoutStore } from '../../store/workoutStore';
const unavailable = 'Health refresh unavailable. Unlock the device and review Health permissions.';
let pending: { owner: string; promise: Promise<HealthSummary | undefined> } | null = null;
export function mergeHealthSnapshot(summary: HealthSummary, workouts: HealthWorkout[], owner: string, error: string | null = null) {
  if (owner !== syncEngine.owner) return;
  // Replace snapshots, never increment dietary calories or manually logged lifting volume.
  const unique = [...new Map(workouts.map(w => [w.id, w])).values()];
  syncEngine.commit({ ...syncEngine.data, health: { ...syncEngine.data.health, summary, workouts: unique, lastBatchAt: Date.now(), error } });
  workoutStore.setState({ importedWorkouts: unique });
}
export async function runHealthBatch(adapter?: HealthAdapter): Promise<HealthSummary | undefined> {
  const owner = syncEngine.owner; if (!owner || !syncEngine.data.health.enabled) return;
  if (pending?.owner === owner) return pending.promise;
  const promise = (async () => {
    try {
      const actual = adapter ?? await (await import('../health/healthAdapter')).getHealthAdapter();
      const now = new Date();
      const [metrics, sessions] = await Promise.allSettled([actual.readToday(now), actual.readWorkouts?.(now) ?? Promise.resolve([])]);
      if (metrics.status === 'rejected') throw new Error(unavailable);
      const summary = metrics.value;
      if ([summary.steps, summary.activeEnergyKcal].some(n => n !== null && (!Number.isFinite(n) || n < 0))) throw new Error(unavailable);
      const workouts = sessions.status === 'fulfilled' ? sessions.value : syncEngine.data.health.workouts;
      mergeHealthSnapshot(summary, workouts, owner, sessions.status === 'rejected' ? 'Steps refreshed. Recent workouts are unavailable; review Health permissions.' : null);
      return owner === syncEngine.owner ? summary : undefined;
    } catch {
      if (owner === syncEngine.owner) syncEngine.commit({ ...syncEngine.data, health: { ...syncEngine.data.health, error: unavailable } });
      throw new Error(unavailable);
    }
  })();
  const batch = { owner, promise }; pending = batch;
  try { return await promise; } finally { if (pending === batch) pending = null; }
}
