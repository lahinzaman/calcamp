import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { GeofencingEventType, type LocationRegion } from 'expo-location';
import { durableStorage } from '../sync/storage';
import { readPreferences } from '../notifications/preferences';
import { notificationRoute } from '../notifications/policy';
import { campusRegion } from './regions';
import { GEOFENCE_TASK } from './geofencing.native';
import { breadcrumb } from '../telemetry/events';
export const PUSH_TASK = 'rulocked-push-v1';
Notifications.setNotificationHandler({ handleNotification: async notification => {
  const owner = durableStorage.get('active-sync-owner');
  const show = !!owner && notification.request.content.data?.owner === owner && readPreferences(owner).enabled
    && !!notificationRoute(notification.request.content.data);
  // Clear the earlier copies of this same reminder before its replacement is presented, so a
  // daily reminder is one entry in Notification Center rather than one per day.
  if (show) {
    try {
      const { dismissEarlierDeliveries } = await import('../notifications/service');
      await dismissEarlierDeliveries(notification.request.identifier);
    } catch { /* Presenting the reminder matters more than tidying the ones behind it. */ }
  }
  return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: false, shouldSetBadge: false };
} });
TaskManager.defineTask<Notifications.NotificationTaskPayload>(PUSH_TASK, async ({ data, error }) => {
  if (error || !data) return Notifications.BackgroundNotificationTaskResult.NoData;
  try {
    const payload = 'actionIdentifier' in data ? data.notification.request.content.data : typeof data.data.dataString === 'string' ? JSON.parse(data.data.dataString) : data.data;
    const owner = durableStorage.get('active-sync-owner');
    if (!owner || payload?.owner !== owner || !readPreferences(owner).enabled || !['gym','sync'].includes(payload?.kind)) return Notifications.BackgroundNotificationTaskResult.NoData;
    breadcrumb('notification.received', { source: 'push' });
    const { wakeSync } = await import('./wake'); return await wakeSync('push') ? Notifications.BackgroundNotificationTaskResult.NewData : Notifications.BackgroundNotificationTaskResult.NoData;
  } catch { return Notifications.BackgroundNotificationTaskResult.Failed; }
});
TaskManager.defineTask<{ eventType: GeofencingEventType; region: LocationRegion }>(GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data?.region.identifier) return;
  const region = campusRegion(data.region.identifier); const owner = durableStorage.get('active-sync-owner');
  if (!region || !owner || !readPreferences(owner).geofencing) return;
  const key = `geofence-inside:${owner}:${region.identifier}`;
  const previous = durableStorage.get(key); const inside = data.eventType === GeofencingEventType.Enter;
  durableStorage.set(key, String(inside));
  if (!inside || previous === 'true') return;
  // Initial iOS state is recorded without an unsolicited arrival prompt.
  if (Platform.OS === 'ios' && previous === null && Date.now() - Number(durableStorage.get(`geofence-started:${owner}`) ?? 0) < 10000) return;
  try {
    const { wakeSync } = await import('./wake'); if (!await wakeSync('geofence')) return;
    const { notifyOnce } = await import('../notifications/service');
    if (region.identifier.startsWith('gym:')) {
      await notifyOnce(owner, region.identifier, 'workout', 'Ready to train?', 'Open your workout log when you are ready to start.');
    } else {
      const { nutritionStore } = await import('../../store/nutritionStore');
      const { remainingMacros, rescueEligible } = await import('../../types/rescue');
      const state = nutritionStore.getState(); const remaining = state.dailyTargets ? remainingMacros(state.dailyTargets.macros, state.consumedMacros) : null;
      if (remaining && rescueEligible(remaining)) {
        const cooldown = `rescue-prefetch-at:${owner}:${region.identifier}`;
        if (Date.now() - Number(durableStorage.get(cooldown) ?? 0) < 300000) return;
        durableStorage.set(cooldown, String(Date.now()));
        const { fetchMacroRescue } = await import('../../api/campus');
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const result = await fetchMacroRescue(region, remaining, 'protein', controller.signal);
          if (owner !== durableStorage.get('active-sync-owner')) return;
          durableStorage.set(`rescue-prefetch:${owner}`, JSON.stringify({ result, remaining, location: { latitude: region.latitude, longitude: region.longitude }, at: Date.now() }));
          if (result.matches.length) await notifyOnce(owner, region.identifier, 'rescue', 'Nearby meal options', 'Open campus dining to review options for your remaining macros.');
        } finally { clearTimeout(timer); }
      }
    }
  } catch { breadcrumb('background.wake', { source: 'geofence', outcome: 'unavailable' }); }
});
