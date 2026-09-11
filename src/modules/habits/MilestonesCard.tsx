import { View } from 'react-native';
import { Text } from '../../theme/primitives';
import { ProgressBar, Reveal } from '../../theme/motion';
import type { Milestone } from './streaks';
export function MilestonesCard({ items, index = 4 }: { items: Milestone[]; index?: number }) {
  return <Reveal index={index}><View className="mb-4 rounded-3xl border border-border bg-surface p-5">
    <Text className="mb-3 text-sm font-bold tracking-widest">MILESTONES</Text>
    {items.map(milestone => <View key={milestone.id} className="mb-3">
      <View className="mb-1 flex-row items-baseline justify-between">
        <Text className={milestone.reached ? 'font-bold' : ''}>{milestone.reached ? '✓ ' : ''}{milestone.label}</Text>
        <Text className="text-sm">{Math.round(milestone.progress * 100)}%</Text>
      </View>
      <ProgressBar value={milestone.progress} target={1} tone={milestone.reached ? 'protein' : 'carbs'} height={6} />
      <Text className="mt-1 text-sm">{milestone.description}</Text>
    </View>)}
  </View></Reveal>;
}
