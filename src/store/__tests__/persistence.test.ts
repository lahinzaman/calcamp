import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNutritionStore } from '../nutritionStore';
import { createWorkoutStore } from '../workoutStore';
import type { TrackingRepository, DailyTotals } from '../../api/trackingRepository';

const macros = { caloriesKcal: 400, proteinG: 20, carbsG: 40, fatG: 18 };
const date = new Date(2026, 8, 7, 12);
function repository(overrides: Partial<TrackingRepository> = {}): TrackingRepository {
  return { userId: async () => 'alice', loadDay: async () => null, saveDay: async () => {}, saveWorkout: async () => 'saved-id', ...overrides };
}
test('cloud diary hydration precedes edits; retries write complete totals without double counting', async () => {
  let saved: DailyTotals | null = null;
  const db = repository({ loadDay: async () => ({ date: '2026-09-07', consumedMacros: macros, consumedMicros: { fiber_g: 3 }, isAdherent: true, bodyWeightLbs: 70 }),
    saveDay: async (_user, day) => { saved = day; } });
  const store = createNutritionStore({ now: () => date, repository: db });
  await store.getState().saveToday();
  assert.equal(store.getState().syncStatus, 'error'); assert.equal(saved, null);
  await store.getState().loadToday();
  store.getState().addConsumed(macros, { fiber_g: 2 });
  await store.getState().saveToday(); await store.getState().saveToday();
  assert.equal(saved!.consumedMacros.caloriesKcal, 800); assert.equal(saved!.consumedMicros.fiber_g, 5);
  assert.equal(saved!.bodyWeightLbs, 70); assert.equal(saved!.isAdherent, true);
});
test('cloud loads cannot overwrite concurrent edits, and reset invalidates in-flight loads', async () => {
  let resolve!: (value: DailyTotals | null) => void;
  const store = createNutritionStore({ now: () => date, repository: repository({ loadDay: () => new Promise(r => { resolve = r; }) }) });
  const load = store.getState().loadToday();
  await new Promise(r => setImmediate(r)); store.getState().addConsumed(macros); resolve(null); await load;
  assert.equal(store.getState().consumedMacros.caloriesKcal, 400); assert.equal(store.getState().syncStatus, 'error');
  store.getState().reset(); const again = store.getState().loadToday();
  await new Promise(r => setImmediate(r)); store.getState().reset(); resolve(null); await again;
  assert.equal(store.getState().cloudOwnerId, null); assert.equal(store.getState().syncStatus, 'idle');
});
test('failed workouts retain detached snapshots for retry and cannot move to another account', async () => {
  let user = 'alice', fail = true, calls = 0;
  const store = createWorkoutStore({ now: () => 1000, repository: repository({ userId: async () => user,
    saveWorkout: async () => { calls++; if (fail) throw new Error('Offline'); return 'uuid'; } }) });
  store.getState().startSession({ id: 'local-session', name: 'Upper', startedAtMs: 0 });
  store.getState().addExercise({ id: 'row', exercise: { id: 'catalog', name: 'Row' }, defaultRestSeconds: 90 });
  store.getState().addSet({ id: 'set', sessionExerciseId: 'row', weightLbs: 100, reps: 5 }); store.getState().completeSet('set');
  const finished = store.getState().finishSession(); finished.sets[0].weightLbs = 1;
  await store.getState().savePendingWorkouts();
  assert.equal(store.getState().pendingWorkouts[0].workout.sets[0].weightLbs, 100);
  assert.equal(store.getState().pendingWorkouts[0].ownerId, 'alice');
  user = 'bob'; fail = false; await store.getState().savePendingWorkouts(); assert.equal(calls, 1);
  user = 'alice'; await store.getState().savePendingWorkouts();
  assert.equal(store.getState().pendingWorkouts.length, 0); assert.equal(store.getState().syncStatus, 'saved');
});
