import { View } from 'react-native';
import { Text } from '../theme/primitives';
export function LoadingCards({ label }: { label: string }) {
  return <View accessibilityRole="progressbar" accessibilityLabel={label} className="my-3 gap-3"><Text className="text-sm text-ink">{label}</Text>{[0, 1, 2].map(n => <View key={n} className="h-20 rounded-2xl bg-raised" />)}</View>;
}
