import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import NetInfo from '@react-native-community/netinfo';
import { durableStorage } from './storage';
const taskName = 'rulocked-sync-v1';
// Global definition is required for cold background launches. No views or permission prompts here.
TaskManager.defineTask(taskName, async ({ error }) => {
  if (error) return BackgroundTask.BackgroundTaskResult.Failed;
  const { syncEngine, activateSync, drainSync } = await import('./runtime');
  let expired = false;
  const expiration = BackgroundTask.addExpirationListener(() => { expired = true; syncEngine.setOnline(false); });
  try {
    const owner = durableStorage.get('active-sync-owner'); if (!owner) return BackgroundTask.BackgroundTaskResult.Success;
    const { getSupabase } = await import('../../api/supabase'); const { data } = await getSupabase().auth.getSession();
    if (expired || data.session?.user.id !== owner || durableStorage.get('active-sync-owner') !== owner) return BackgroundTask.BackgroundTaskResult.Failed;
    if (syncEngine.owner !== owner) activateSync(owner);
    const network = await NetInfo.fetch(); if (expired || syncEngine.owner !== owner) return BackgroundTask.BackgroundTaskResult.Failed; syncEngine.setOnline(network.isConnected !== false && network.isInternetReachable !== false);
    let healthFailed = false;
    try { await (await import('./healthBatch')).runHealthBatch(); } catch { healthFailed = true; }
    if (expired) return BackgroundTask.BackgroundTaskResult.Failed;
    await drainSync();
    return healthFailed || syncEngine.data.queue.length ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success;
  } catch { return BackgroundTask.BackgroundTaskResult.Failed; }
  finally { expiration.remove(); }
});
export async function registerBackgroundSync() {
  if (await BackgroundTask.getStatusAsync() === BackgroundTask.BackgroundTaskStatus.Available && !await TaskManager.isTaskRegisteredAsync(taskName))
    await BackgroundTask.registerTaskAsync(taskName, { minimumInterval: 15 });
}
export async function unregisterBackgroundSync() {
  if (await TaskManager.isTaskRegisteredAsync(taskName)) await BackgroundTask.unregisterTaskAsync(taskName);
}
