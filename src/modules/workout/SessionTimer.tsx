import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { Text } from '../../theme/primitives';
import { useT } from '../../i18n';
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
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setNow(Date.now()); });
    return () => { clearInterval(id); subscription.remove(); };
  }, []);
  return <View className="mb-4 items-center rounded-3xl border border-border bg-surface p-5">
    <Text className="text-sm font-bold tracking-widest">{t('train.elapsed')}</Text>
    <Text accessibilityLabel={`Session time ${elapsedLabel(now - startedAtMs)}`} className="my-1 text-5xl font-bold"
      style={{ fontVariant: ['tabular-nums'] }}>{elapsedLabel(now - startedAtMs)}</Text>
    <View className="mt-3 flex-row flex-wrap justify-center gap-6">
      <View className="items-center"><Text className="text-2xl font-bold" style={{ fontVariant: ['tabular-nums'] }}>{sets}</Text><Text className="text-sm">{t('train.sets')}</Text></View>
      <View className="items-center"><Text className="text-2xl font-bold" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(volumeLbs).toLocaleString()}</Text><Text className="text-sm">lbs moved</Text></View>
    </View>
  </View>;
}
