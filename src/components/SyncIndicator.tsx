import { Text, View } from 'react-native';
import { useSyncStatus } from '../store/syncStore';
export function SyncIndicator() {
  const s = useSyncStatus();
  if (!s.ready) return null;
  const label = s.syncing ? 'Syncing…' : !s.online ? `Offline · ${s.queued} queued` : s.blocked ? `${s.blocked} edit(s) need review` : s.queued ? `${s.queued} saved on device · queued` : s.lastSyncedAt ? 'Synced' : 'Saved on device';
  return <View className="my-3 rounded-xl bg-white p-3"><Text accessibilityLiveRegion="polite" className={s.blocked || s.error ? 'text-sm font-medium text-amber-800' : 'text-sm font-medium text-emerald-800'}>{label}</Text>{s.error && <Text className="mt-1 text-xs text-zinc-600">{s.error}</Text>}</View>;
}
