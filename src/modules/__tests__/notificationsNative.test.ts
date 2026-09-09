import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type * as Notifications from 'expo-notifications';
import { durableStorage } from '../sync/storage';
import { defaultPreferences } from '../notifications/policy';
let owner = 'alice'; let granted = true; let requested = 0; let registered = false;
const schedules = new Map<string, Notifications.NotificationRequestInput>();
const writes: Record<string, unknown>[] = [];
let rotateOwner = false;
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
  cancelScheduledNotificationAsync: async (id: string) => { schedules.delete(id); }, dismissAllNotificationsAsync: async () => {},
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
