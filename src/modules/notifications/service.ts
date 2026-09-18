import type { UserProfile } from '../../types/profile';
import type { NotificationPreferences } from './policy';
export async function configureNotifications(_owner: string, _preferences: NotificationPreferences, _profile: UserProfile | null, _request = false) { throw new Error('Notifications are available in the iOS and Android app.'); }
/** Web has no notification permission to hold, so nothing here was ever granted. */
export async function notificationsGranted() { return false; }
export async function clearNotifications() {}
export async function dismissEarlierDeliveries(_identifier: string) {}
export async function dismissDeliveredNotifications() {}
export async function removePushRegistration(_owner: string) {}
export async function notifyOnce(_owner: string, _key: string, _kind: 'workout' | 'rescue', _title: string, _body: string) {}
