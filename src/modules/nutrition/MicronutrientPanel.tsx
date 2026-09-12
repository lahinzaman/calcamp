import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { ProgressBar, Reveal } from '../../theme/motion';
import { useNutritionStore } from '../../store/nutritionStore';
import { GROUP_LABELS, nutrientStatuses, type NutrientGroup, type NutrientStatus } from './dailyValues';
const ORDER: NutrientGroup[] = ['vitamin', 'mineral', 'macro', 'other'];
const round = (value: number) => Number(value.toFixed(value < 10 ? 1 : 0));
function Row({ status, reported }: { status: NutrientStatus; reported: boolean }) {
  const percent = Math.round(status.ratio * 100);
  const over = status.kind === 'limit' && status.ratio > 1;
  return <View className="mb-4">
    <View className="mb-1 flex-row items-baseline justify-between gap-3">
      <Text className="flex-1 font-semibold">{status.label}</Text>
      {reported
        ? <><Text className="text-sm">{round(status.amount)} / {round(status.target)} {status.unit.replace('_', ' ')}</Text>
            <Text className={over ? 'text-sm font-bold' : 'text-sm'} style={{ width: 52, textAlign: 'right' }}>{percent}%</Text></>
        : <Text className="text-sm">not reported · {status.kind === 'limit' ? 'limit' : 'target'} {round(status.target)} {status.unit.replace('_', ' ')}</Text>}
    </View>
    <Text className="mb-2 text-sm">{status.why}</Text>
    {reported && <ProgressBar value={status.amount} target={status.target} height={6} tone={status.kind === 'limit' ? 'fat' : status.ratio >= 1 ? 'protein' : 'carbs'} />}
  </View>;
}
export function MicronutrientPanel({ index = 3, micros, startOpen = false }: { index?: number; micros?: Partial<Record<string, number>>; startOpen?: boolean }) {
  const live = useNutritionStore(s => s.consumedMicros);
  const consumed = micros ?? live;
  const [open, setOpen] = useState(startOpen);
  const [showAll, setShowAll] = useState(false);
  const { tracked, unreported } = nutrientStatuses(consumed);
  const all = [...tracked, ...unreported];
  const goals = tracked.filter(status => status.kind === 'goal');
  const met = goals.filter(status => status.ratio >= 1).length;
  const limits = tracked.filter(status => status.kind === 'limit' && status.ratio > 1);
  return <Reveal index={index}><View className="mb-5 rounded-3xl border border-border bg-surface p-5">
    <Pressable accessibilityRole="button" accessibilityLabel="Show micronutrients" accessibilityState={{ expanded: open }}
      weight="subtle" onPress={() => setOpen(value => !value)} className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <Text className="text-sm font-bold tracking-widest">MICRONUTRIENTS</Text>
        <Text className="mt-1">{tracked.length
          ? `${met} of ${goals.length} targets met${limits.length ? ` · ${limits.length} over a limit` : ''} · ${all.length} nutrients tracked`
          : `Nothing you logged reported nutrients yet. All ${all.length} are tracked and fill in as you log foods that publish them.`}</Text>
      </View>
      <Text>{open ? '▴' : '▾'}</Text>
    </Pressable>
    {open && <View className="mt-4">
      {ORDER.filter(group => all.some(status => status.group === group)).map(group => <View key={group} className="mb-5">
        <Text className="mb-3 text-sm font-bold tracking-widest">{GROUP_LABELS[group].toUpperCase()}</Text>
        {tracked.filter(status => status.group === group).sort((a, b) => b.ratio - a.ratio)
          .map(status => <Row key={status.key} status={status} reported />)}
        {showAll && unreported.filter(status => status.group === group).map(status => <Row key={status.key} status={status} reported={false} />)}
      </View>)}
      {!!unreported.length && <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAll }}
        accessibilityLabel={showAll ? 'Hide nutrients nothing reported' : `Show the ${unreported.length} nutrients nothing reported`}
        weight="subtle" onPress={() => setShowAll(value => !value)} className="mb-3 rounded-2xl bg-raised px-4 py-3">
        <Text className="font-bold">{showAll ? 'Hide what was not reported' : `Show ${unreported.length} nutrients nothing reported`}</Text>
        <Text className="mt-1 text-sm">All {all.length} are tracked. Most foods publish only a handful, and an unreported nutrient is unknown, not zero — so it is never counted against you.</Text>
      </Pressable>}
      <Text className="mt-1 text-sm">Percentages use FDA Daily Values for adults, or an Adequate Intake where no Daily Value exists — a general reference, not medical advice.</Text>
    </View>}
  </View></Reveal>;
}
