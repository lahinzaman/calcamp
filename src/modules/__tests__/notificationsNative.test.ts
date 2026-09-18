import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type * as Notifications from 'expo-notifications';
import { durableStorage } from '../sync/storage';
import { defaultPreferences } from '../notifications/policy';
let owner = 'alice'; let granted = true; let requested = 0; let registered = false;
const schedules = new Map<string, Notifications.NotificationRequestInput>();
const writes: Record<string, unknown>[] = [];
let rotateOwner = false;
const delivered: string[] = []; const dismissed: string[] = [];
mock.module('react-native', { namedExports: { Platform: { OS: 'ios' } } });
mock.module('expo-crypto', { namedExports: { randomUUID: () => 'installation' } });
mock.module('expo-device', { namedExports: { isDevice: true } });
mock.module('expo-constants', { defaultExport: { easConfig: { projectId: 'eas-id' } } });
mock.module('expo-task-manager', { namedExports: { isTaskRegisteredAsync: async () => registered } });
mock.module('../../api/supabase.ts', { namedExports: { getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: owner } } } }) },
  rpc: async (_name: string, body: Record<string, unknown>) => { writes.push(body); return { error: null }; },
}) } });
mock.module('expo-notifications', { namedExports: {
  getPermissionsAsync: async () => ({ granted }), requestPermissionsAsync: async () => { requested++; return { granted }; },
  getAllScheduledNotificationsAsync: async () => [...schedules].map(([identifier]) => ({ identifier })),
  cancelScheduledNotificationAsync: async (id: string) => { schedules.delete(id); },
  dismissAllNotificationsAsync: async () => { delivered.length = 0; },
  getPresentedNotificationsAsync: async () => delivered.map(identifier => ({ date: 0, request: { identifier } })),
  dismissNotificationAsync: async (id: string) => { dismissed.push(id); for (let i = delivered.length - 1; i >= 0; i--) if (delivered[i] === id) delivered.splice(i, 1); },
  registerTaskAsync: async () => { registered = true; }, unregisterTaskAsync: async () => { registered = false; },
  scheduleNotificationAsync: async (input: Notifications.NotificationRequestInput) => { schedules.set(input.identifier!, input); return input.identifier; },
  getDevicePushTokenAsync: async () => ({ data: 'apns-native' }),
  getExpoPushTokenAsync: async () => { if (rotateOwner) owner = 'bob'; return { data: 'ExpoPushToken[abc]' }; },
  IosAuthorizationStatus: { PROVISIONAL: 3 }, SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly' },
} });
test('native scheduling is idempotent, permissions are explicit, and token writes are owner-bound', async () => {
  const { configureNotifications } = await import('../notifications/service.native');
  durableStorage.set('active-sync-owner', 'alice');
  const p = { ...defaultPreferences, enabled: true, nutritionReminders: true };
  await configureNotifications('alice', p, null); await configureNotifications('alice', p, null);
  assert.equal(schedules.size, 1); assert.equal(requested, 0); assert.equal(registered, true);
  assert.equal(writes.at(-1)?.p_owner, 'alice');
  assert.equal((writes.at(-1)?.p_registration as Record<string, unknown>).native_token, 'apns-native');
  granted = false; await assert.rejects(configureNotifications('alice', p, null), /disabled/);
  assert.equal(schedules.size, 0); assert.equal(registered, false); assert.equal(requested, 0);
  assert.equal(writes.at(-1)?.p_registration, null);
  granted = true; rotateOwner = true; const count = writes.length;
  await assert.rejects(configureNotifications('alice', p, null), /Sign in/); assert.equal(writes.length, count);
});

test('a walk across campus produces one arrival alert, not one for every region', async () => {
  owner = 'alice'; rotateOwner = false; granted = true;
  const { notifyOnce } = await import('../notifications/service.native');
  durableStorage.set('active-sync-owner', 'alice');
  durableStorage.set('notifications:alice', JSON.stringify({ ...defaultPreferences, enabled: true, geofencing: true }));
  for (const key of ['gym:werblin', 'dining:the-atrium', 'gym:college-ave']) {
    // Each region has its own four-hour cooldown, so only the shared arrival budget stops these.
    await notifyOnce('alice', key, 'workout', 'Ready to train?', 'Open your workout log.');
  }
  const arrivals = [...schedules.keys()].filter(id => id.includes('gym:') || id.includes('dining:'));
  assert.equal(arrivals.length, 1, 'the second and third arrivals are inside the shared cooldown');
  assert.equal(arrivals[0], 'rulocked:alice:gym:werblin');
});

test('a replacing arrival takes the previous one out of the tray, and a reminder clears its earlier copies', async () => {
  owner = 'alice'; rotateOwner = false; granted = true;
  const { notifyOnce, dismissEarlierDeliveries } = await import('../notifications/service.native');
  durableStorage.set('active-sync-owner', 'alice');
  durableStorage.set('notifications:alice', JSON.stringify({ ...defaultPreferences, enabled: true, geofencing: true }));
  // Far enough back that both the per-region and the shared budgets have expired.
  const stale = String(Date.now() - 5 * 3600_000);
  durableStorage.set('notification-cooldown:alice:arrival', stale);
  durableStorage.set('notification-cooldown:alice:gym:livingston', stale);
  durableStorage.set('notification-last-arrival:alice', 'rulocked:alice:gym:werblin');
  dismissed.length = 0;
  await notifyOnce('alice', 'gym:livingston', 'workout', 'Ready to train?', 'Open your workout log.');
  assert.deepEqual(dismissed, ['rulocked:alice:gym:werblin'], 'the alert it supersedes is taken down');
  assert.equal(durableStorage.get('notification-last-arrival:alice'), 'rulocked:alice:gym:livingston');

  // Twenty days of an untouched daily reminder are twenty tray entries under one identifier.
  dismissed.length = 0; delivered.push(...Array.from({ length: 20 }, () => 'rulocked:alice:nutrition'));
  await dismissEarlierDeliveries('rulocked:alice:nutrition');
  assert.deepEqual(dismissed, ['rulocked:alice:nutrition']);
  assert.equal(delivered.length, 0, 'every earlier copy goes before the new one is presented');

  dismissed.length = 0;
  await dismissEarlierDeliveries('someone-elses-notification');
  assert.deepEqual(dismissed, [], 'only CalCamp reminders are touched');
});
