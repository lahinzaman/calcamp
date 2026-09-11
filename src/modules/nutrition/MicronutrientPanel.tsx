import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { ProgressBar, Reveal } from '../../theme/motion';
import { useNutritionStore } from '../../store/nutritionStore';
import { GROUP_LABELS, nutrientStatuses, type NutrientGroup, type NutrientStatus } from './dailyValues';
const ORDER: NutrientGroup[] = ['vitamin', 'mineral', 'macro', 'other'];
const round = (value: number) => Number(value.toFixed(value < 10 ? 1 : 0));
function Row({ status }: { status: NutrientStatus }) {
  const percent = Math.round(status.ratio * 100);
  const over = status.kind === 'limit' && status.ratio > 1;
  return <View className="mb-3">
    <View className="mb-1 flex-row items-baseline justify-between gap-3">
      <Text className="flex-1" numberOfLines={1}>{status.label}</Text>
      <Text className="text-sm">{round(status.amount)} / {round(status.target)} {status.unit.replace('_', ' ')}</Text>
      <Text className={over ? 'text-sm font-bold' : 'text-sm'} style={{ width: 52, textAlign: 'right' }}>{percent}%</Text>
    </View>
    <ProgressBar value={status.amount} target={status.target} height={6} tone={status.kind === 'limit' ? 'fat' : status.ratio >= 1 ? 'protein' : 'carbs'} />
  </View>;
}
export function MicronutrientPanel({ index = 3 }: { index?: number }) {
  const consumed = useNutritionStore(s => s.consumedMicros);
  const [open, setOpen] = useState(false);
  const { tracked, unreported } = nutrientStatuses(consumed);
  const goals = tracked.filter(status => status.kind === 'goal');
  const met = goals.filter(status => status.ratio >= 1).length;
  const limits = tracked.filter(status => status.kind === 'limit' && status.ratio > 1);
  return <Reveal index={index}><View className="mb-5 rounded-3xl border border-border bg-surface p-5">
    <Pressable accessibilityRole="button" accessibilityLabel="Show micronutrients" accessibilityState={{ expanded: open }}
      weight="subtle" onPress={() => setOpen(value => !value)} className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <Text className="text-sm font-bold tracking-widest">MICRONUTRIENTS</Text>
        <Text className="mt-1">{tracked.length ? `${met} of ${goals.length} targets met${limits.length ? ` · ${limits.length} over a limit` : ''}` : 'Log a food with nutrient data to see this fill in.'}</Text>
      </View>
      <Text>{open ? '▴' : '▾'}</Text>
    </Pressable>
    {open && <View className="mt-4">
      {ORDER.filter(group => tracked.some(status => status.group === group)).map(group => <View key={group} className="mb-4">
        <Text className="mb-2 text-sm font-bold">{GROUP_LABELS[group]}</Text>
        {tracked.filter(status => status.group === group).sort((a, b) => b.ratio - a.ratio).map(status => <Row key={status.key} status={status} />)}
      </View>)}
      {!!unreported.length && <Text className="text-sm">{unreported.length} nutrients were not reported by the foods you logged. Unreported is not the same as zero.</Text>}
      <Text className="mt-3 text-sm">Percentages use FDA Daily Values for adults — a general reference, not medical advice.</Text>
    </View>}
  </View></Reveal>;
}
