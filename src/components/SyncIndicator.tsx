import { View } from 'react-native';
import { Text } from '../theme/primitives';
import { useSyncStatus } from '../store/syncStore';
export function SyncIndicator() {
  const s = useSyncStatus();
  if (!s.ready) return null;
  const label = s.syncing ? 'Syncing…' : !s.online ? `Offline · ${s.queued} queued` : s.blocked ? `${s.blocked} edit(s) need review` : s.queued ? `${s.queued} saved on device · queued` : s.lastSyncedAt ? 'Synced' : 'Saved on device';
  return <View className="my-3 rounded-xl bg-surface p-3"><Text accessibilityLiveRegion="polite" className={s.blocked || s.error ? 'text-sm font-medium text-ink' : 'text-sm font-medium text-ink'}>{label}</Text>{s.error && <Text className="mt-1 text-xs text-ink">{s.error}</Text>}</View>;
}
