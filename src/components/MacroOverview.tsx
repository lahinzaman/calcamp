import { View } from 'react-native';
import { Text } from '../theme/primitives';
import { Pop, ProgressBar, Reveal, useCountUp } from '../theme/motion';
import { useNutritionStore } from '../store/nutritionStore';
function MacroCell({ label, consumed, target, tone }: { label: string; consumed: number; target: number | undefined; tone: 'protein' | 'carbs' | 'fat' }) {
  const shown = useCountUp(consumed);
  return <View style={{ flexGrow: 1, flexBasis: 120 }}>
    <Text className="font-bold">{label}</Text>
    <Text className="mb-2 text-sm">{Math.round(shown)} / {target ?? '—'} g</Text>
    <ProgressBar value={consumed} target={target ?? 0} tone={tone} />
  </View>;
}
export function MacroOverview() {
  const consumed = useNutritionStore(s => s.consumedMacros); const targets = useNutritionStore(s => s.dailyTargets?.macros);
  const calories = useCountUp(consumed.caloriesKcal);
  const remaining = targets ? targets.caloriesKcal - consumed.caloriesKcal : 0;
  return <Reveal style={{ marginVertical: 20 }}><View className="rounded-3xl border border-border bg-surface p-5">
    <Text className="text-sm font-bold">DAILY ENERGY</Text>
    <Pop trigger={consumed.caloriesKcal}>
      <View className="my-3 flex-row flex-wrap items-baseline gap-2"><Text className="text-4xl leading-[52px] font-bold">{Math.round(calories)}</Text><Text>{targets ? `/ ${targets.caloriesKcal} kcal` : 'kcal logged'}</Text></View>
    </Pop>
    <ProgressBar value={consumed.caloriesKcal} target={targets?.caloriesKcal ?? 0} height={10} />
    <Text className="mb-4 mt-3">{targets ? remaining < 0 ? `${Math.round(-remaining)} kcal above target` : `${Math.round(remaining)} kcal remaining` : 'Set daily targets in your profile to see progress.'}</Text>
    <View className="flex-row flex-wrap gap-4">{([['Protein','proteinG','protein'],['Carbs','carbsG','carbs'],['Fat','fatG','fat']] as const).map(([label,key,tone]) =>
      <MacroCell key={key} label={label} consumed={consumed[key]} target={targets?.[key]} tone={tone} />)}</View>
  </View></Reveal>;
}
