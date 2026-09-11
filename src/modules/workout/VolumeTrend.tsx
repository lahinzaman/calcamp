import { View } from 'react-native';
import { Text } from '../../theme/primitives';
import { BarChart } from '../../components/charts/LineChart';
import type { SessionVolumePoint } from './history';
/** Isolated so the SVG dependency stays out of screens that only need the numbers. */
export function VolumeTrend({ log }: { log: SessionVolumePoint[] }) {
  if (log.length < 2) return null;
  const shown = log.slice(-20);
  return <View className="mt-5">
    <Text className="mb-2 text-sm font-bold tracking-widest">SESSION VOLUME</Text>
    <BarChart series={shown} tone="protein" height={120} />
    <Text className="mt-2 text-sm text-ink">Total working-set pounds moved per session, last {shown.length} sessions.</Text>
  </View>;
}
