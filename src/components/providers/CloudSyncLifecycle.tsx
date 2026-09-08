import { safelyEdit } from '../safelyEdit';
import { useSyncStatus } from '../../store/syncStore';
import { registerBackgroundSync, unregisterBackgroundSync } from '../../modules/sync/background';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { nutritionStore } from '../../store/nutritionStore';
import { useOnboardingStore } from '../../store/onboardingStore';
import { workoutStore } from '../../store/workoutStore';
import { authStore, useAuthStore } from '../../store/authStore';

export function CloudSyncLifecycle() {
  const cache = useQueryClient();
  const profile = useAuthStore(s => s.profile);
  useEffect(() => {
    const applyTargets = () => {
      if (!profile?.onboarding_completed_at) return;
      const macros = profile.is_advanced_track && profile.training_days.includes(new Date().getDay())
        ? profile.training_targets : profile.rest_targets;
      safelyEdit(() => nutritionStore.getState().syncToday());
      nutritionStore.getState().setDailyTargets(macros ? { macros, micronutrients: {} } : null);
    };
    applyTargets(); const timer = setInterval(applyTargets, 60_000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') applyTargets(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [profile]);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    Promise.all([import('../../api/supabase'), import('../../modules/sync/runtime'), import('@react-native-community/netinfo')]).then(([{ getSupabase }, runtime, { default: NetInfo }]) => {
      if (disposed) return;
      const client = getSupabase();
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (disposed) return;
        const previous = authStore.getState().session?.user.id;
        const changed = previous !== session?.user.id;
        if (previous && changed) useOnboardingStore.getState().reset();
        if (changed || !session) {
          try { runtime.activateSync(session?.user.id ?? null); } catch { authStore.getState().fail('Offline storage could not be opened. Free device space and restart the app.'); return; }
          cache.clear();
        }
        authStore.getState().acceptSession(session);
        if (session && changed) setTimeout(() => { if (!disposed && authStore.getState().session?.user.id === session.user.id) void runtime.refreshDiary(); }, 0);
      });
      const offNetwork = NetInfo.addEventListener(network => {
        const online = network.isConnected !== false && network.isInternetReachable !== false;
        const wasOnline = runtime.syncEngine.online; runtime.syncEngine.setOnline(online);
        if (!wasOnline && online) void runtime.refreshDiary();
      });
      const timer = setInterval(() => { if (AppState.currentState === 'active') void runtime.drainSync(); }, 5000);
      const scheduleBackground = (state: ReturnType<typeof authStore.getState>) => {
        if (state.session) void registerBackgroundSync().catch(() => useSyncStatus.setState({ error: 'Background sync is unavailable. Sync resumes when you open the app.' }));
        else void unregisterBackgroundSync().catch(() => {});
      };
      const offAuth = authStore.subscribe(scheduleBackground); scheduleBackground(authStore.getState());
      const updateRefresh = (state: string) => {
        if (state === 'active') { void NetInfo.fetch().then(network => runtime.syncEngine.setOnline(network.isConnected !== false && network.isInternetReachable !== false)).catch(() => {}); void runtime.drainSync(); void import('../../modules/health/useHealthSync').then(({ healthStore }) => healthStore.getState().refresh()); }
        if (Platform.OS !== 'web') state === 'active' ? client.auth.startAutoRefresh() : client.auth.stopAutoRefresh();
      };
      updateRefresh(AppState.currentState);
      const listener = AppState.addEventListener('change', updateRefresh);
      cleanup = () => { clearInterval(timer); offNetwork(); offAuth(); data.subscription.unsubscribe(); listener.remove(); if (Platform.OS !== 'web') client.auth.stopAutoRefresh(); };
    }).catch(error => { if (!disposed) authStore.getState().fail(error instanceof Error ? error.message : 'Authentication unavailable.'); });
    return () => { disposed = true; cleanup?.(); };
  }, [cache]);
  return null;
}
