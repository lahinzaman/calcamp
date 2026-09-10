import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { getSupabase } from '../../api/supabase';
import { durableStorage } from '../sync/storage';
import { breadcrumb } from '../telemetry/events';
import { readPreferences } from './preferences';
import { reminderPlan, type NotificationPreferences } from './policy';
import type { UserProfile } from '../../types/profile';
async function deadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Push registration is unavailable. It will retry when connected.')), 15000); })]); }
  finally { clearTimeout(timer); }
}
const channelId = 'rulocked-reminders';
let chain = Promise.resolve();
function installation() { let id = durableStorage.get('push-installation'); if (!id) { id = randomUUID(); durableStorage.set('push-installation', id); } return id; }
async function verifyOwner(owner: string) { const { data } = await getSupabase().auth.getSession(); if (data.session?.user.id !== owner || durableStorage.get('active-sync-owner') !== owner) throw new Error('Sign in to configure notifications.'); }
function serialize(work: () => Promise<void>) { const next = chain.then(work, work); chain = next.catch(() => {}); return next; }
export function clearNotifications() { return serialize(async () => {
  for (const request of await Notifications.getAllScheduledNotificationsAsync()) if (request.identifier.startsWith('rulocked:')) await Notifications.cancelScheduledNotificationAsync(request.identifier);
  await Notifications.dismissAllNotificationsAsync();
}); }
export async function removePushRegistration(owner: string) {
  await verifyOwner(owner); const { error } = await getSupabase().rpc('set_push_installation', { p_owner: owner, p_installation: installation(), p_registration: null });
  if (error) throw new Error('Push registration could not be removed. Try again when connected.');
}
export function configureNotifications(owner: string, preferences: NotificationPreferences, profile: UserProfile | null, request = false) {
  return serialize(async () => {
    await verifyOwner(owner);
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(channelId, { name: 'CalCamp reminders', importance: Notifications.AndroidImportance.DEFAULT });
    let permission = await Notifications.getPermissionsAsync();
    if (request && preferences.enabled && !permission.granted) permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    const allowed = permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    breadcrumb('notification.registration', { outcome: allowed ? 'ok' : 'denied' });
    // Cancel before replacement; repeated launches cannot accumulate scheduled reminders.
    for (const item of await Notifications.getAllScheduledNotificationsAsync()) if (item.identifier.startsWith('rulocked:')) await Notifications.cancelScheduledNotificationAsync(item.identifier);
    await verifyOwner(owner);
    if (!preferences.enabled || !allowed) { if (await TaskManager.isTaskRegisteredAsync('rulocked-push-v1')) await Notifications.unregisterTaskAsync('rulocked-push-v1'); await removePushRegistration(owner); if (preferences.enabled) throw new Error('Notifications are disabled. Enable them in system settings.'); return; }
    if (!await TaskManager.isTaskRegisteredAsync('rulocked-push-v1')) await Notifications.registerTaskAsync('rulocked-push-v1');
    for (const reminder of reminderPlan(preferences, profile)) {
      await verifyOwner(owner);
      await Notifications.scheduleNotificationAsync({ identifier: `rulocked:${owner}:${reminder.id}`, content: {
        title: reminder.title, body: reminder.body, sound: 'default', data: { kind: reminder.kind, owner },
      }, trigger: reminder.weekday ? { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: reminder.weekday, hour: reminder.hour, minute: reminder.minute, channelId }
        : { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: reminder.hour, minute: reminder.minute, channelId } });
    }
    if (!Device.isDevice) throw new Error('Local reminders are ready. Register push notifications on a physical device.');
    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) throw new Error('Local reminders are ready. Push registration needs the linked EAS project.');
    const native = await deadline(Notifications.getDevicePushTokenAsync());
    const expo = await deadline(Notifications.getExpoPushTokenAsync({ projectId }));
    await verifyOwner(owner);
    const { error } = await getSupabase().rpc('set_push_installation', { p_owner: owner, p_installation: installation(), p_registration: {
      native_token: String(native.data), expo_token: expo.data, platform: Platform.OS,
      gym_alerts: preferences.gymAlerts, threshold: preferences.gymThreshold, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    } });
    if (error) throw new Error('Reminders are scheduled. Push registration will retry when connected.');
    durableStorage.set(`push-registered:${owner}`, String(Date.now()));
  });
}
export async function notifyOnce(owner: string, key: string, kind: 'workout' | 'rescue', title: string, body: string) {
  if (!readPreferences(owner).enabled) return;
  await verifyOwner(owner);
  const storageKey = `notification-cooldown:${owner}:${key}`;
  if (Date.now() - Number(durableStorage.get(storageKey) ?? 0) < 4 * 3600_000) return;
  const permission = await Notifications.getPermissionsAsync();
  await verifyOwner(owner); const preferences = readPreferences(owner);
  if (!preferences.enabled || !preferences.geofencing || (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL)) return;
  // Claim before scheduling: an interrupted callback cannot create a burst on restart.
  durableStorage.set(storageKey, String(Date.now()));
  await Notifications.scheduleNotificationAsync({ identifier: `rulocked:${owner}:${key}`, content: { title, body, data: { kind, owner } }, trigger: null });
}
