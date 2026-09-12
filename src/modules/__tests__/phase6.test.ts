import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultPreferences, parsePreferences, reminderPlan, notificationRoute } from '../notifications/policy';
import { memoryStorage } from '../sync/storage';
import { SyncEngine } from '../sync/engine';
import { readRescuePrefetch } from '../background/rescuePrefetch';
import { setTelemetrySink, breadcrumb } from '../telemetry/events';
import type { UserProfile } from '../../types/profile';
const profile = { is_advanced_track: true, training_days: [5, 1, 4, 2] } as UserProfile;
test('notification settings default to opt-out and reject invalid clocks', () => {
  assert.deepEqual(parsePreferences(null), defaultPreferences);
  for (const input of [{ enabled: 'yes' }, { workoutTime: '24:01' }, { nutritionTime: '2:00' }, { weighInDay: 7 }, { weighInTime: '9:00' }]) assert.throws(() => parsePreferences(input));
  assert.deepEqual(reminderPlan(defaultPreferences, profile), []);
  assert.equal('secret' in parsePreferences({ secret: 'ignored' }), false);
});
test('local reminders have stable IDs, calendar weekdays, and ordered Upper/Lower splits', () => {
  const p = { ...defaultPreferences, enabled: true, workoutReminders: true, nutritionReminders: true, workoutTime: '18:15' };
  const reminders = reminderPlan(p, profile);
  assert.deepEqual(reminders.slice(1).map(r => [r.title, r.weekday, r.hour, r.minute]), [
    ['Time for Upper A',2,18,15], ['Time for Lower A',3,18,15], ['Time for Upper B',5,18,15], ['Time for Lower B',6,18,15],
  ]);
  assert.equal(new Set(reminders.map(r => r.id)).size, 5);
  assert.equal(reminderPlan(p, { ...profile, is_advanced_track: false }).length, 1);
  assert.equal(reminderPlan(p, { ...profile, training_days: [0,1,2,4] }).at(-1)?.weekday, 1);
  // A push naming a route the app no longer has resolves to nothing, not to a URL it carries.
  assert.equal(notificationRoute({ kind: 'gym', url: 'https://malicious.example' }), null);
  assert.equal(notificationRoute({ url: '/private' }), null); assert.equal(notificationRoute(null), null);
});
test('offline activity snapshots coalesce without adding calories or losing another day', async () => {
  const disk = memoryStorage(); const sent: number[] = [];
  const engine = new SyncEngine(disk, async (_owner, job) => { if (job.kind === 'activity') sent.push(job.data.steps!); });
  engine.activate('alice'); engine.setOnline(false);
  const data = { date: '2026-09-08', steps: 1000, activeEnergyKcal: 50, source: 'healthkit' as const, observedAt: '2026-09-08T12:00:00Z' };
  engine.queue({ kind: 'activity', data }, 'first'); engine.queue({ kind: 'activity', data: { ...data, steps: 2000 } }, 'latest');
  engine.queue({ kind: 'activity', data: { ...data, date: '2026-09-07', steps: 9000 } }, 'yesterday');
  assert.equal(engine.data.queue.length, 2); assert.deepEqual(engine.data.days, {});
  engine.activate('bob'); assert.equal(engine.data.queue.length, 0);
  engine.activate('alice'); engine.setOnline(true); await engine.drain();
  assert.deepEqual(sent, [2000, 9000]); assert.equal(engine.data.queue.length, 0);
});
test('prefetched rescue data expires, is account-scoped, and invalidates when macros change', () => {
  const disk = memoryStorage(); const remaining = { caloriesKcal: 600, proteinG: 50, carbsG: 60, fatG: 20 };
  disk.set('rescue-prefetch:alice', JSON.stringify({ at: 1000, remaining, location: { latitude: 40.5, longitude: -74.4 }, result: { matches: [] } }));
  assert.ok(readRescuePrefetch('alice', remaining, 2000, disk));
  assert.equal(readRescuePrefetch('bob', remaining, 2000, disk), null);
  assert.equal(readRescuePrefetch('alice', remaining, 301001, disk), null);
  assert.equal(readRescuePrefetch('alice', { ...remaining, proteinG: 10 }, 2000, disk), null);
  assert.equal(readRescuePrefetch('alice', remaining, 0, disk), null);
});
test('telemetry failures cannot prevent offline mutations', () => {
  setTelemetrySink(() => { throw new Error('telemetry offline'); });
  assert.doesNotThrow(() => breadcrumb('sync.queued', { count: 1 })); setTelemetrySink(undefined);
});
