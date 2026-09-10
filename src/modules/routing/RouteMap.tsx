import { View } from 'react-native';
import { Text } from '../../theme/primitives';
import type { Coordinate, WalkingLoop } from './walkingLoop';
export interface RouteMapProps { start: Coordinate; route: WalkingLoop | null; token: string }
export default function RouteMap(_props: RouteMapProps) {
  return <View className="h-48 items-center justify-center rounded-3xl bg-raised p-6"><Text className="text-center text-ink">The interactive Mapbox map is available in the iOS and Android development builds. Route distance is shown below.</Text></View>;
}
