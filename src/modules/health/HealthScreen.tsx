import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { ProgressBar, Reveal } from '../../theme/motion';
import { Choice } from '../../components/FormControls';
import { LoadingCards } from '../../components/LoadingCards';
import { SyncIndicator } from '../../components/SyncIndicator';
import { CalorieRing } from '../../components/charts/CalorieRing';
import { haptic } from '../../theme/haptics';
import { useAuthStore } from '../../store/authStore';
import { localDateKey, useNutritionStore } from '../../store/nutritionStore';
import { loadHistory, shiftDate, type HistoryDay } from '../../api/history';
import { loadActivity } from '../../api/activityHistory';
import { loadMeasurements } from '../../api/measurements';
import { calculateTdee } from '../nutrition/tdee';
import { MicronutrientPanel } from '../nutrition/MicronutrientPanel';
import { dayLabel, dayOfMonth, dayStatus, shortWeekday, weekDates, PERFECT_WINDOW_KCAL } from '../diary/logCalendar';
import { syncEngine } from '../sync/runtime';
import { bigThree, type BigThreeSummary } from '../workout/bigThree';
import {
  BodyCompositionCard, Card, ConsistencyCard, EnergyBalanceCard,
  GoalProgressCard, MacroSplitCard, StepsCard, WeeklyAveragesCard,
} from '../insights/AnalyticsCards';

const RANGES = [[28, '4 weeks'], [56, '8 weeks'], [90, '13 weeks']] as const;
const MACROS = [['Protein', 'proteinG', 'protein'], ['Carbs', 'carbsG', 'carbs'], ['Fat', 'fatG', 'fat']] as const;
const MARK_TONE: Record<string, string> = { perfect: 'bg-accent', over: 'bg-raised', under: 'bg-raised', logged: 'bg-surface', none: 'bg-raised' };

function BigThreeCard({ summary, index }: { summary: BigThreeSummary; index: number }) {
  return <Card title="The big three" index={index}>
    {!summary.lifts.length && <Text>Log a barbell squat, bench press or deadlift and your bests appear here.</Text>}
    {summary.lifts.map(lift => <View key={lift.key} className="mb-3 flex-row flex-wrap items-baseline justify-between gap-2">
      <View style={{ flexGrow: 1, flexBasis: 150 }}>
        <Text className="font-bold">{lift.label}</Text>
        <Text className="text-sm">{lift.exerciseName} · {lift.sessions} {lift.sessions === 1 ? 'session' : 'sessions'}</Text>
      </View>
      <Text className="text-2xl font-bold" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(lift.bestWeightLbs)} lbs</Text>
      <Text className="w-full text-sm">Best estimated max {Math.round(lift.bestOneRepMaxLbs)} lbs</Text>
    </View>)}
    {summary.totalLbs !== null && <View className="mt-2 rounded-2xl bg-raised p-4">
      <Text className="text-3xl font-bold">{Math.round(summary.totalLbs)} lbs</Text>
      <Text className="mt-1 text-sm">Heaviest-set total · {Math.round(summary.estimatedTotalLbs!)} lbs by estimated max.</Text>
    </View>}
    {!!summary.missing.length && !!summary.lifts.length && <Text className="mt-2 text-sm">
      No {summary.missing.join(' or ').toLowerCase()} logged yet, so there is no total to show.</Text>}
    <Text className="mt-3 text-xs">Counts full-range barbell variants only. Partial pulls and different lifts with similar names are left out, so the total means what it usually means.</Text>
  </Card>;
}

/**
 * Health is the "how am I actually doing" tab: pick a day to see what you ate and what you
 * took in, then everything underneath is the longer view that a single day cannot show.
 */
export default function HealthScreen() {
  const owner = useAuthStore(s => s.session?.user.id);
  const profile = useAuthStore(s => s.profile);
  const targets = useNutritionStore(s => s.dailyTargets?.macros);
  const liveMacros = useNutritionStore(s => s.consumedMacros);
  const liveMicros = useNutritionStore(s => s.consumedMicros);
  const today = localDateKey(new Date());
  const [days, setDays] = useState<number>(28);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState(today);
  const [lifts, setLifts] = useState<BigThreeSummary>(() => bigThree({}));
  useEffect(() => { setLifts(bigThree(syncEngine.data.lifts ?? {})); }, []);

  const from = shiftDate(today, -(days - 1));
  const history = useQuery({ enabled: !!owner, queryKey: ['history', owner, days, today], queryFn: () => loadHistory(owner!, from, today) });
  const activity = useQuery({ enabled: !!owner, queryKey: ['activity', owner, days, today], queryFn: () => loadActivity(owner!, from, today), staleTime: 300_000 });
  const measurements = useQuery({ enabled: !!owner, queryKey: ['measurements-range', owner, days, today], queryFn: () => loadMeasurements(owner!, from, today), staleTime: 300_000 });

  const rows: HistoryDay[] = useMemo(() => history.data ?? [], [history.data]);
  const byDate = useMemo(() => new Map(rows.map(row => [row.log_date, row])), [rows]);
  const estimate = useMemo(() => {
    try { return calculateTdee(rows, { windowDays: 28, asOfDate: today }); } catch { return null; }
  }, [rows, today]);

  const week = useMemo(() => weekDates(today, weekOffset), [today, weekOffset]);
  const isToday = selected === today;
  const day = byDate.get(selected);
  const macros = isToday ? liveMacros : day ? { caloriesKcal: day.calories_kcal ?? 0, proteinG: day.proteinG ?? 0, carbsG: day.carbsG ?? 0, fatG: day.fatG ?? 0 } : null;
  const micros = isToday ? liveMicros : day?.micros ?? {};
  const status = dayStatus(isToday ? liveMacros.caloriesKcal : day?.calories_kcal, targets?.caloriesKcal ?? null);
  const stepsToday = activity.data?.find(entry => entry.activity_date === selected)?.steps ?? null;
  const weightToday = isToday ? null : day?.body_weight_lbs ?? null;
  const weights = rows.filter(row => row.body_weight_lbs !== null);
  const latestWeight = weights.length ? weights[weights.length - 1].body_weight_lbs : null;
  const goalWeight = (profile?.lifestyle_survey as { goalWeightLbs?: number | null } | null | undefined)?.goalWeightLbs ?? null;
  const protein = rows.filter(row => row.proteinG !== null);
  const averageProtein = protein.length ? protein.reduce((sum, row) => sum + row.proteinG!, 0) / protein.length : null;

  return <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background">
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <Reveal index={0}>
        <Text className="text-sm font-bold tracking-widest">HEALTH</Text>
        <Text className="mb-1 mt-2 text-4xl font-bold">How you are doing</Text>
        <Text className="mb-4">Pick a day for the detail. Everything below it is the longer view.</Text>
        <SyncIndicator />
      </Reveal>

      <Reveal index={1}>
        <View className="mb-3 flex-row items-center justify-between gap-2">
          <Pressable accessibilityRole="button" accessibilityLabel="Previous week" weight="subtle"
            onPress={() => { setWeekOffset(value => value - 1); haptic('selection'); }}
            className="h-11 w-11 items-center justify-center rounded-full bg-surface"><Text className="text-lg font-bold">‹</Text></Pressable>
          <Text className="flex-1 text-center text-sm font-bold">{weekOffset === 0 ? 'This week' : `${week[0]} → ${week[6]}`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next week" weight="subtle" disabled={weekOffset >= 0}
            onPress={() => { setWeekOffset(value => Math.min(0, value + 1)); haptic('selection'); }}
            style={weekOffset >= 0 ? { opacity: .3 } : undefined}
            className="h-11 w-11 items-center justify-center rounded-full bg-surface"><Text className="text-lg font-bold">›</Text></Pressable>
        </View>
        <View className="flex-row gap-1">
          {week.map(date => {
            const marked = dayStatus(date === today ? liveMacros.caloriesKcal : byDate.get(date)?.calories_kcal, targets?.caloriesKcal ?? null);
            const chosen = date === selected;
            return <Pressable key={date} accessibilityRole="button" accessibilityState={{ selected: chosen }}
              accessibilityLabel={`${dayLabel(date)}. ${marked.label}`} disabled={date > today}
              onPress={() => { setSelected(date); haptic('selection'); }} weight="firm"
              style={{ flex: 1, opacity: date > today ? .3 : 1 }}
              className={`items-center rounded-2xl py-3 ${chosen ? 'bg-accent' : MARK_TONE[marked.mark]}`}>
              <Text className="text-xs">{shortWeekday(date)}</Text>
              <Text className={`my-1 text-base font-bold ${date === today ? 'underline' : ''}`}>{dayOfMonth(date)}</Text>
              <Text className="text-xs">{marked.glyph}</Text>
            </Pressable>;
          })}
        </View>
        <Text className="mt-2 text-xs">A tick is a day within {PERFECT_WINDOW_KCAL} kcal of your calorie target.</Text>
      </Reveal>

      {history.isPending && <View className="mt-4"><LoadingCards label="Loading your history…" /></View>}
      {history.isError && <Card title="History unavailable" index={2}>
        <Text>We could not reach your cloud diary. Today is still tracked on this device — try again when connected.</Text>
      </Card>}

      <Card title={isToday ? 'Today' : dayLabel(selected)} index={2}>
        {!macros && <Text>Nothing was logged on this day.</Text>}
        {macros && <>
          <CalorieRing consumed={macros.caloriesKcal} target={targets?.caloriesKcal ?? null} />
          <Text className="mt-3 text-center text-sm">{status.label}</Text>
          <View className="mt-5 flex-row flex-wrap gap-4">
            {MACROS.map(([label, key, tone]) => <View key={key} style={{ flexGrow: 1, flexBasis: 96 }}>
              <View className="mb-1 flex-row items-baseline justify-between gap-2">
                <Text className="text-sm font-bold">{label}</Text>
                <Text className="text-sm" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(macros[key])}{targets ? `/${Math.round(targets[key])}` : ''} g</Text>
              </View>
              <ProgressBar value={macros[key]} target={targets?.[key] ?? 0} tone={tone} height={10} />
            </View>)}
          </View>
          <View className="mt-4 flex-row flex-wrap gap-5">
            {stepsToday !== null && <View><Text className="text-2xl font-bold">{stepsToday.toLocaleString()}</Text><Text className="text-sm">Steps</Text></View>}
            {weightToday !== null && <View><Text className="text-2xl font-bold">{weightToday.toFixed(1)}</Text><Text className="text-sm">Weighed lbs</Text></View>}
          </View>
        </>}
      </Card>

      <MicronutrientPanel index={3} micros={micros} />

      {!history.isPending && !history.isError && <>
        <Reveal index={4}>
          <View className="mb-4 flex-row flex-wrap">{RANGES.map(([value, label]) => <Choice key={value} label={label}
            selected={days === value} onPress={() => { setDays(value); haptic('selection'); }} />)}</View>
        </Reveal>
        <GoalProgressCard estimate={estimate} goalWeightLbs={goalWeight} index={5} />
        <Card title="Adaptive expenditure" index={6}>
          {estimate?.status === 'ready' ? <>
            <Text className="text-4xl font-bold">{Math.round(estimate.tdeeKcal!)} kcal</Text>
            <Text className="mt-1">Measured from your logged intake and weight trend over {estimate.adherentDays} complete days — an observation, not a target.</Text>
          </> : <>
            <Text className="text-xl font-bold">Still measuring</Text>
            <Text className="mt-2">This needs 14 days with both a weigh-in and a complete food log. You have {estimate?.adherentDays ?? 0}.</Text>
          </>}
        </Card>
        <EnergyBalanceCard rows={rows} estimate={estimate} index={7} />
        <MacroSplitCard rows={rows} bodyWeightLbs={latestWeight} index={8} />
        <StepsCard activity={activity.data ?? []} index={9} />
        <BigThreeCard summary={lifts} index={10} />
        <BodyCompositionCard measurements={measurements.data ?? []} weightLbs={latestWeight} index={11} />
        <WeeklyAveragesCard rows={rows} index={12} />
        <ConsistencyCard rows={rows} windowDays={days} estimate={estimate} averageProtein={averageProtein} index={13} />
      </>}
    </ScrollView>
  </SafeAreaView>;
}
