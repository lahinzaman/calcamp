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
/**
 * A daily reminder keeps its request identifier, but every delivery is a *new* entry in
 * Notification Center and nothing was removing them — three weeks of untouched reminders is the
 * twenty-deep stack of CalCamp banners. iOS SDK 57 exposes no `threadIdentifier` on scheduled
 * content, so the pile cannot be collapsed into one; it has to be dismissed.
 *
 * Called from the notification handler before the new copy is presented: dismissing by
 * identifier clears every earlier delivery of that same reminder, so the arriving one is the
 * only one left. Only the foreground path can do this — iOS presents background deliveries
 * without consulting us — which is why opening the app also clears the tray.
 */
export function dismissEarlierDeliveries(identifier: string) {
  if (!identifier.startsWith('rulocked:')) return Promise.resolve();
  return serialize(async () => {
    const delivered = await Notifications.getPresentedNotificationsAsync();
    if (delivered.some(item => item.request.identifier === identifier)) await Notifications.dismissNotificationAsync(identifier);
  });
}
/**
 * Opening the app answers every reminder it could have sent, so none of them should still be
 * sitting in Notification Center behind it. This is what bounds a stack that built up while the
 * app was closed, where nothing else runs.
 */
export function dismissDeliveredNotifications() { return serialize(() => Notifications.dismissAllNotificationsAsync()); }
export async function removePushRegistration(owner: string) {
  await verifyOwner(owner); const { error } = await getSupabase().rpc('set_push_installation', { p_owner: owner, p_installation: installation(), p_registration: null });
  if (error) throw new Error('Push registration could not be removed. Try again when connected.');
}
/**
 * Whether the system would deliver a notification right now. `configureNotifications` also
 * throws for outcomes that are not a refusal — a simulator with no push, an unlinked EAS
 * project, a registration upload that failed — so a caller that needs to know whether the
 * person said yes has to ask, rather than read it off an exception.
 */
export async function notificationsGranted() {
  try {
    const permission = await Notifications.getPermissionsAsync();
    return permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch { return false; }
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
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    } });
    if (error) throw new Error('Reminders are scheduled. Push registration will retry when connected.');
    durableStorage.set(`push-registered:${owner}`, String(Date.now()));
  });
}
/** One arrival alert every two hours, whichever corner of campus you walked through. */
const ARRIVAL_COOLDOWN_MS = 2 * 3600_000;
export async function notifyOnce(owner: string, key: string, kind: 'workout' | 'rescue', title: string, body: string) {
  if (!readPreferences(owner).enabled) return;
  await verifyOwner(owner);
  const storageKey = `notification-cooldown:${owner}:${key}`;
  if (Date.now() - Number(durableStorage.get(storageKey) ?? 0) < 4 * 3600_000) return;
  // The per-region cooldown alone let a walk across campus stack one alert per region, and
  // there are eight of them. Arrivals share a single budget so only one can land at a time.
  const globalKey = `notification-cooldown:${owner}:arrival`;
  if (Date.now() - Number(durableStorage.get(globalKey) ?? 0) < ARRIVAL_COOLDOWN_MS) return;
  const permission = await Notifications.getPermissionsAsync();
  await verifyOwner(owner); const preferences = readPreferences(owner);
  if (!preferences.enabled || !preferences.geofencing || (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL)) return;
  // Claim before scheduling: an interrupted callback cannot create a burst on restart.
  durableStorage.set(storageKey, String(Date.now()));
  durableStorage.set(globalKey, String(Date.now()));
  // Each region carries its own identifier, so the previous arrival is a separate entry in the
  // tray rather than something the new one replaces. Take it down by hand.
  const previous = durableStorage.get(`notification-last-arrival:${owner}`);
  if (previous) await Notifications.dismissNotificationAsync(previous).catch(() => {});
  const identifier = `rulocked:${owner}:${key}`;
  durableStorage.set(`notification-last-arrival:${owner}`, identifier);
  await Notifications.scheduleNotificationAsync({ identifier, content: { title, body, data: { kind, owner } }, trigger: null });
}
