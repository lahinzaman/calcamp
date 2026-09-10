import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SyncEngine, retryDelay, type NutritionMutation } from '../sync/engine';
import { memoryStorage } from '../sync/storage';
import { emptyMacros } from '../../types/nutrition';
import type { DailyTotals } from '../../api/trackingRepository';
const day = (n = 0, date = '2026-09-08'): DailyTotals => ({ date, consumedMacros: { ...emptyMacros(), caloriesKcal: n }, consumedMicros: {}, bodyWeightLbs: null, isAdherent: false });
const mutation = (date = '2026-09-08'): NutritionMutation => ({ date, macros: { ...emptyMacros(), caloriesKcal: 100 }, micros: {}, patch: {} });
test('outbox survives restart, stays account scoped, and drains on reconnection', async () => {
  const storage = memoryStorage(); const sent: string[] = [];
  const first = new SyncEngine(storage, async () => { assert.fail('offline send'); });
  first.activate('alice'); first.setOnline(false); first.recordNutrition(day(100), day(), 'one');
  const next = new SyncEngine(storage, async (owner, job) => { sent.push(`${owner}:${job.id}`); return day(100); });
  next.activate('bob'); assert.equal(next.data.queue.length, 0);
  next.activate('alice'); assert.equal(next.data.days['2026-09-08'].consumedMacros.caloriesKcal, 100);
  next.setOnline(true); await next.drain(); assert.deepEqual(sent, ['alice:one']);
  const reloaded = new SyncEngine(storage, async () => {}); reloaded.activate('alice'); assert.equal(reloaded.data.queue.length, 0);
});
test('lost acknowledgement retries the same ID with backoff, preserving edits made in flight', async () => {
  let now = 100; let fail = true; const ids: string[] = [];
  const engine = new SyncEngine(memoryStorage(), async (_owner, job) => {
    ids.push(job.id); if (fail) { fail = false; throw new Error('lost response'); }
    return day(job.id === 'one' ? 100 : 200);
  }, undefined, () => now, () => 0.5);
  engine.activate('alice'); engine.recordNutrition(day(100), day(), 'one'); await engine.drain();
  assert.equal(engine.data.queue[0].nextAttemptAt, 2100);
  engine.recordNutrition(day(200), day(100), 'two'); await engine.drain(); assert.deepEqual(ids, ['one']);
  now = 2100; await engine.drain(); assert.deepEqual(ids, ['one', 'one', 'two']);
  assert.equal(engine.data.days['2026-09-08'].consumedMacros.caloriesKcal, 200); assert.equal(engine.data.queue.length, 0);
});
test('a blocked day cannot be overtaken, but another day can sync; discard is atomic with canonical refresh', async () => {
  const sent: string[] = [];
  const engine = new SyncEngine(memoryStorage(), async (_owner, job) => { sent.push(job.id); if (job.id === 'bad') throw Object.assign(new Error('constraint'), { code: '23514' }); });
  engine.activate('alice'); engine.queue({ kind: 'nutrition', data: mutation() }, 'bad'); engine.queue({ kind: 'nutrition', data: mutation() }, 'later');
  engine.queue({ kind: 'nutrition', data: mutation('2026-09-07') }, 'other'); await engine.drain();
  assert.deepEqual(sent, ['bad', 'other']); assert.throws(() => engine.discard('bad'), /Reload/);
  assert.equal(engine.data.queue.length, 2); engine.discard('bad', day(50));
  assert.equal(engine.data.days['2026-09-08'].consumedMacros.caloriesKcal, 150); assert.equal(engine.data.queue[0].id, 'later');
});
test('storage failure never acknowledges an edit; account changes ignore an old response', async () => {
  const disk = memoryStorage(); let full = true;
  let resolve!: (d: DailyTotals) => void;
  const engine = new SyncEngine({ ...disk, set: (key, value) => { if (full) throw new Error('full'); disk.set(key, value); } }, () => new Promise(r => { resolve = r; }));
  engine.activate('alice'); assert.throws(() => engine.recordNutrition(day(100), day(), 'one'), /storage/); assert.equal(engine.data.queue.length, 0);
  full = false; engine.recordNutrition(day(100), day(), 'one'); const request = engine.drain(); engine.activate('bob'); resolve(day(100)); await request;
  assert.equal(engine.owner, 'bob'); assert.deepEqual(engine.data.days, {}); engine.activate('alice'); assert.equal(engine.data.queue.length, 1);
});
test('health export receipts survive restarts and repeated snapshots never requeue an export', async () => {
  const disk = memoryStorage(); const engine = new SyncEngine(disk, async () => {}); engine.activate('alice');
  const payload = { kind: 'health-workout' as const, data: { id: 'w', name: 'Upper', start: '2026-09-08T10:00:00Z', end: '2026-09-08T11:00:00Z' } };
  engine.queue(payload, 'health:alice:w'); await engine.drain();
  const resumed = new SyncEngine(disk, async () => { assert.fail('duplicate'); }); resumed.activate('alice'); resumed.queue(payload, 'health:alice:w'); assert.equal(resumed.data.queue.length, 0);
  assert.ok(retryDelay(100, () => 0) >= 240000); assert.ok(retryDelay(100, () => 1) <= 360000);
});
test('edits arriving while the first send is pending are reapplied over its canonical acknowledgement', async () => {
  let resolve!: (d: DailyTotals) => void; let first = true;
  const engine = new SyncEngine(memoryStorage(), async () => { if (first) { first = false; return new Promise<DailyTotals>(r => { resolve = r; }); } return day(200); });
  engine.activate('alice'); engine.recordNutrition(day(100), day(), 'one'); const request = engine.drain();
  engine.recordNutrition(day(200), day(100), 'two'); resolve(day(100)); await request;
  assert.equal(engine.data.days['2026-09-08'].consumedMacros.caloriesKcal, 200); assert.equal(engine.data.queue.length, 0);
});

test('a stale cloud read cannot overwrite a newer acknowledged diary edit', async () => {
  const engine = new SyncEngine(memoryStorage(), async () => day(100)); engine.activate('alice');
  const readRevision = engine.revision; engine.recordNutrition(day(100), day(), 'new'); await engine.drain();
  assert.equal(engine.mergeRemoteIfUnchanged(day(), readRevision), false);
  assert.equal(engine.data.days['2026-09-08'].consumedMacros.caloriesKcal, 100);
  assert.equal(engine.mergeRemoteIfUnchanged(day(150), engine.revision), true);
  assert.equal(engine.data.days['2026-09-08'].consumedMacros.caloriesKcal, 150);
});
