import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';
import { useSyncStatus } from '../../store/syncStore';
export async function checkService(signal: AbortSignal): Promise<boolean> {
  const base = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!base) return false;
  const controller = new AbortController(); const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
  const timer = setTimeout(cancel, 10000);
  try {
    const response = await fetch(new URL('/health', base), { signal: controller.signal });
    if (!response.ok) return false;
    const value = await response.json(); return value.status === 'ok' && value.database === 'ok';
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
export default function SettingsScreen() {
  const s = useSyncStatus();
  const service = useQuery({ queryKey: ['service-health'], queryFn: ({ signal }) => checkService(signal), enabled: s.online,
    refetchInterval: 60000, retry: false, staleTime: 30000 });
  const label = !s.online ? 'Offline' : s.blocked ? 'Sync needs review' : s.syncing ? 'Syncing…' : s.queued ? `${s.queued} queued` : !s.ready || service.isPending ? 'Checking…' : service.isError || !service.data || s.error ? 'Connection unavailable' : s.lastSyncedAt ? 'Synced' : 'Waiting for first sync';
  return <SafeAreaView edges={['top','left','right']} className="flex-1 bg-background"><View className="p-6"><Text className="mb-6 text-3xl font-bold">Settings</Text><View className="rounded-3xl bg-surface p-6"><Text className="mb-3 text-sm">Backend & database</Text><Text accessibilityLiveRegion="polite" className="text-3xl font-bold">{label}</Text></View></View></SafeAreaView>;
}
