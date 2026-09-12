import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { Text } from '../../theme/primitives';
export function elapsedLabel(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
/** Wall-clock elapsed time, so a backgrounded app still shows the real session length. */
export function SessionTimer({ startedAtMs, volumeLbs, sets }: { startedAtMs: number; volumeLbs: number; sets: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setNow(Date.now()); });
    return () => { clearInterval(id); subscription.remove(); };
  }, []);
  return <View className="mb-4 flex-row items-center gap-5 rounded-3xl border border-border bg-surface p-5">
    <View>
      <Text className="text-sm font-bold tracking-widest">ELAPSED</Text>
      <Text accessibilityLabel={`Session time ${elapsedLabel(now - startedAtMs)}`} className="text-4xl font-bold" style={{ fontVariant: ['tabular-nums'] }}>{elapsedLabel(now - startedAtMs)}</Text>
    </View>
    <View className="flex-1 flex-row justify-end gap-5">
      <View className="items-end"><Text className="text-2xl font-bold">{sets}</Text><Text className="text-sm">sets</Text></View>
      <View className="items-end"><Text className="text-2xl font-bold">{Math.round(volumeLbs).toLocaleString()}</Text><Text className="text-sm">lbs moved</Text></View>
    </View>
  </View>;
}
