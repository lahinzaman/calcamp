import { View } from 'react-native';
import { Text } from '../theme/primitives';
import { ProgressBar, Reveal, useCountUp } from '../theme/motion';
import { CalorieRing } from './charts/CalorieRing';
import { useNutritionStore } from '../store/nutritionStore';
import type { MacroTotals } from '../types/nutrition';
const MACROS = [['Protein', 'proteinG', 'protein'], ['Carbs', 'carbsG', 'carbs'], ['Fat', 'fatG', 'fat']] as const;
function MacroColumn({ label, consumed, target, tone }: { label: string; consumed: number; target: number | null; tone: 'protein' | 'carbs' | 'fat' }) {
  const shown = useCountUp(Math.round(consumed));
  const left = target === null ? null : Math.round(target - consumed);
  return <View style={{ flexGrow: 1, flexBasis: 96 }}>
    <View className="mb-1 flex-row items-baseline justify-between">
      <Text className="text-sm font-bold">{label}</Text>
      <Text className="text-sm" style={{ fontVariant: ['tabular-nums'] }}>{shown}<Text className="text-sm">{target === null ? ' g' : `/${Math.round(target)} g`}</Text></Text>
    </View>
    <ProgressBar value={consumed} target={target ?? 0} tone={tone} height={10} />
    {left !== null && <Text className="mt-1 text-xs">{left >= 0 ? `${left} g left` : `${Math.abs(left)} g over`}</Text>}
  </View>;
}
export function MacroOverview() {
  const consumed = useNutritionStore(s => s.consumedMacros);
  const targets = useNutritionStore(s => s.dailyTargets?.macros) as MacroTotals | undefined;
  return <Reveal index={0}><View className="my-5 rounded-3xl border border-border bg-surface p-5">
    <Text className="mb-3 text-sm font-bold tracking-widest">DAILY ENERGY</Text>
    <CalorieRing consumed={consumed.caloriesKcal} target={targets?.caloriesKcal ?? null} />
    {!targets && <Text className="mt-3 text-center text-sm">Set daily targets in Settings to see progress against a goal.</Text>}
    <View className="mt-5 flex-row flex-wrap gap-4">
      {MACROS.map(([label, key, tone]) => <MacroColumn key={key} label={label} consumed={consumed[key]} target={targets?.[key] ?? null} tone={tone} />)}
    </View>
  </View></Reveal>;
}
