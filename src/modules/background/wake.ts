import { durableStorage } from '../sync/storage';
import { breadcrumb } from '../telemetry/events';
export async function wakeSync(source: 'push' | 'geofence') {
  const owner = durableStorage.get('active-sync-owner'); if (!owner) return false;
  const { getSupabase } = await import('../../api/supabase'); const { data } = await getSupabase().auth.getSession();
  if (data.session?.user.id !== owner) return false;
  const { syncEngine, activateSync, drainSync } = await import('../sync/runtime');
  if (durableStorage.get('active-sync-owner') !== owner) return false;
  if (syncEngine.owner !== owner) activateSync(owner);
  const { nutritionStore } = await import('../../store/nutritionStore');
  if (syncEngine.owner !== owner || durableStorage.get('active-sync-owner') !== owner) return false;
  nutritionStore.getState().syncToday();
  try {
    const raw = durableStorage.get(`profile:${owner}`); const profile = raw ? JSON.parse(raw) : null;
    const targets = profile?.is_advanced_track && profile.training_days?.includes(new Date().getDay()) ? profile.training_targets : profile?.rest_targets;
    if (targets) nutritionStore.getState().setDailyTargets({ macros: targets, micronutrients: {} });
  } catch { /* Existing targets remain usable if the cached profile is unavailable. */ }
  breadcrumb('background.wake', { source });
  const { default: NetInfo } = await import('@react-native-community/netinfo'); const network = await NetInfo.fetch();
  if (syncEngine.owner !== owner || durableStorage.get('active-sync-owner') !== owner) return false;
  syncEngine.setOnline(network.isConnected !== false && network.isInternetReachable !== false);
  try { await (await import('../sync/healthBatch')).runHealthBatch(); } catch { /* Retain last good health snapshot. */ }
  await drainSync(); return owner === syncEngine.owner;
}
