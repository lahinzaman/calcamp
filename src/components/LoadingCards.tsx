import { View } from 'react-native';
import { Text } from '../theme/primitives';
import { Skeleton } from '../theme/motion';
export function LoadingCards({ label }: { label: string }) {
  return <View accessibilityRole="progressbar" accessibilityLabel={label} className="my-3 gap-3"><Text className="text-sm text-ink">{label}</Text>{[0, 1, 2].map(n => <Skeleton key={n} height={80} />)}</View>;
}
