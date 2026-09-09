import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { configureNotifications, clearNotifications } from './service.native';
import { readPreferences } from './preferences';
import { notificationRoute } from './policy';
import { configureGeofencing, stopGeofencing } from '../background/geofencing';
import { PUSH_TASK } from '../background/registry.native';
import { breadcrumb } from '../telemetry/events';
export function NotificationLifecycle() {
  const handled = useRef<string | null>(null);
  const owner = useAuthStore(s => s.session?.user.id); const profile = useAuthStore(s => s.profile);
  useEffect(() => {
    let disposed = false; let lastAttempt = 0;
    const reconcile = async (force = false) => {
      if (!owner || !profile?.onboarding_completed_at) return;
      if (!force && Date.now() - lastAttempt < 60_000) return; lastAttempt = Date.now();
      const p = readPreferences(owner);
      try { await configureNotifications(owner, p, profile); } catch { breadcrumb('notification.registration', { outcome: 'unavailable' }); }
      if (disposed) return;
      try { await configureGeofencing(owner, p.geofencing); } catch { breadcrumb('background.wake', { source: 'geofence', outcome: 'denied' }); }

    };
    if (!owner) { void clearNotifications().catch(() => {}); void stopGeofencing().catch(() => {}); void Notifications.unregisterTaskAsync(PUSH_TASK).catch(() => {}); }
    else void reconcile(true).catch(() => {});
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (disposed || !owner || !profile?.onboarding_completed_at || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const data = response.notification.request.content.data; const route = notificationRoute(data);
      const responseKey = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
      if (data?.owner !== owner || !route || handled.current === responseKey) return;
      handled.current = responseKey;
      router.push(route); void Notifications.clearLastNotificationResponseAsync();
    };
    handle(Notifications.getLastNotificationResponse());
    const tap = Notifications.addNotificationResponseReceivedListener(handle);
    const received = Notifications.addNotificationReceivedListener(() => breadcrumb('notification.received', { source: 'push' }));
    const rotation = Notifications.addPushTokenListener(() => { void reconcile(true).catch(() => {}); });
    const network = NetInfo.addEventListener(state => { if (state.isConnected && state.isInternetReachable !== false) void reconcile().catch(() => {}); });
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void reconcile().catch(() => {}); });
    return () => { disposed = true; tap.remove(); received.remove(); rotation.remove(); foreground.remove(); network(); };
  }, [owner, profile]);
  return null;
}
