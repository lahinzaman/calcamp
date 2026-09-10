import { View } from 'react-native';
import { Text } from '../theme/primitives';
import { ProgressBar } from '../theme/motion';
import { useNutritionStore } from '../store/nutritionStore';
export function MacroOverview() {
  const consumed = useNutritionStore(s => s.consumedMacros); const targets = useNutritionStore(s => s.dailyTargets?.macros);
  return <View className="my-5 rounded-3xl border border-border bg-surface p-5">
    <Text className="text-sm font-bold">DAILY ENERGY</Text>
    <View className="my-3 flex-row flex-wrap items-baseline gap-2"><Text className="text-4xl leading-[52px] font-bold">{Math.round(consumed.caloriesKcal)}</Text><Text>{targets ? `/ ${targets.caloriesKcal} kcal` : 'kcal logged'}</Text></View>
    <ProgressBar value={consumed.caloriesKcal} target={targets?.caloriesKcal ?? 0} />
    <Text className="mb-4 mt-3">{targets ? consumed.caloriesKcal > targets.caloriesKcal ? `${Math.round(consumed.caloriesKcal - targets.caloriesKcal)} kcal above target` : `${Math.round(targets.caloriesKcal - consumed.caloriesKcal)} kcal remaining` : 'Set daily targets in your profile to see progress.'}</Text>
    <View className="flex-row flex-wrap gap-4">{([['Protein','proteinG','protein'],['Carbs','carbsG','carbs'],['Fat','fatG','fat']] as const).map(([label,key,tone]) => <View key={key} style={{ flexGrow: 1, flexBasis: 120 }}>
      <Text className="font-bold">{label}</Text><Text className="mb-2 text-sm">{Math.round(consumed[key])} / {targets?.[key] ?? '—'} g</Text><ProgressBar value={consumed[key]} target={targets?.[key] ?? 0} tone={tone} />
    </View>)}</View>
  </View>;
}
