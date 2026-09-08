import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { SyncEngine } from '../sync/engine';
import { memoryStorage } from '../sync/storage';
import type { HealthAdapter, HealthWorkout } from '../health/types';
const engine = new SyncEngine(memoryStorage(), async () => {});
let imported: HealthWorkout[] = [];
mock.module('../sync/runtime.ts', { namedExports: { syncEngine: engine } });
mock.module('../../store/workoutStore.ts', { namedExports: { workoutStore: { setState: (state: { importedWorkouts: HealthWorkout[] }) => { imported = state.importedWorkouts; } } } });
const { runHealthBatch } = require('../sync/healthBatch') as typeof import('../sync/healthBatch');
const workout = { id: 'watch', name: 'Walk', start: '2026-09-08T10:00:00Z', end: '2026-09-08T11:00:00Z' };
const summary = { steps: 1234, activeEnergyKcal: 90, date: '2026-09-08' };
const adapter: HealthAdapter = { initialize: async () => {}, readToday: async () => summary, readWorkouts: async () => [workout, workout], writeWorkout: async () => {}, writeDietaryEnergy: async () => {} };
test('health batches replace snapshots, deduplicate imports and never change nutrition or lifting volume', async () => {
  engine.activate('alice'); engine.commit({ ...engine.data, health: { ...engine.data.health, enabled: true } });
  await Promise.all([runHealthBatch(adapter), runHealthBatch(adapter)]); await runHealthBatch(adapter);
  assert.deepEqual(engine.data.health.summary, summary); assert.equal(imported.length, 1);
  assert.deepEqual(engine.data.days, {}); assert.equal(engine.data.workout, null); assert.equal(engine.data.queue.length, 0);
  await runHealthBatch({ ...adapter, readWorkouts: async () => [] }); assert.equal(imported.length, 0, 'deleted workouts disappear from latest snapshot');
});
test('workout permission failure preserves cached imports while valid step statistics refresh', async () => {
  await runHealthBatch(adapter);
  await runHealthBatch({ ...adapter, readWorkouts: async () => { throw new Error('permission denied'); } });
  assert.deepEqual(engine.data.health.summary, summary); assert.equal(imported.length, 1); assert.match(engine.data.health.error!, /workouts are unavailable/);
});
test('late health results cannot cross an account boundary', async () => {
  let resolve!: (value: typeof summary) => void;
  const request = runHealthBatch({ ...adapter, readToday: () => new Promise(r => { resolve = r; }) });
  engine.activate('bob'); resolve(summary); await request;
  assert.equal(engine.data.health.summary, null); assert.equal(engine.data.health.workouts.length, 0);
});
