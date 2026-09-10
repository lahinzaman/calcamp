import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { SyncEngine } from '../sync/engine';
import { emptyMacros } from '../../types/nutrition';
const database = new DatabaseSync(':memory:');
mock.module('expo-sqlite', { namedExports: { openDatabaseSync: () => ({
  execSync: (sql: string) => database.exec(sql),
  runSync: (sql: string, ...args: string[]) => database.prepare(sql).run(...args),
  getFirstSync: (sql: string, ...args: string[]) => database.prepare(sql).get(...args),
}) } });
const { durableStorage } = require('../sync/storage.native') as typeof import('../sync/storage.native');
test('real SQLite commits the outbox and diary atomically and preserves prior data on a failed write', async () => {
  const engine = new SyncEngine(durableStorage, async () => {}); engine.activate('alice');
  const previous = { date: '2026-09-08', consumedMacros: emptyMacros(), consumedMicros: {}, bodyWeightLbs: null, isAdherent: false };
  const next = { ...previous, consumedMacros: { ...emptyMacros(), caloriesKcal: 100 } };
  engine.recordNutrition(next, previous, 'one');
  const restored = new SyncEngine(durableStorage, async () => {}); restored.activate('alice');
  assert.equal(restored.data.queue[0].id, 'one'); assert.equal(restored.data.days[next.date].consumedMacros.caloriesKcal, 100);
  database.exec("CREATE TRIGGER disk_failure BEFORE UPDATE ON durable_state BEGIN SELECT RAISE(ABORT, 'simulated device write failure'); END;");
  assert.throws(() => restored.recordNutrition({ ...next, isAdherent: true }, next, 'two'), /storage/);
  const lastGood = new SyncEngine(durableStorage, async () => {}); lastGood.activate('alice');
  assert.equal(lastGood.data.queue.length, 1); assert.equal(lastGood.data.days[next.date].isAdherent, false);
  database.close();
});
