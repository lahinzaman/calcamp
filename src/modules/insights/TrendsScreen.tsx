import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';
import { Reveal } from '../../theme/motion';
import { LoadingCards } from '../../components/LoadingCards';
import { Choice } from '../../components/FormControls';
import { BarChart, LineChart } from '../../components/charts/LineChart';
import { useAuthStore } from '../../store/authStore';
import { useNutritionStore } from '../../store/nutritionStore';
import { loadHistory, shiftDate, type HistoryDay } from '../../api/history';
import { calculateTdee } from '../nutrition/tdee';
import { MilestonesCard } from '../habits/MilestonesCard';
import { MeasurementsCard } from './MeasurementsCard';
import { milestones, summarizeStreak } from '../habits/streaks';
import { localDateKey } from '../../store/nutritionStore';
const RANGES = [[28, '4 weeks'], [56, '8 weeks'], [90, '13 weeks']] as const;
function Card({ title, children, index }: { title: string; children: React.ReactNode; index: number }) {
  return <Reveal index={index}><View className="mb-4 rounded-3xl border border-border bg-surface p-5">
    <Text className="mb-3 text-sm font-bold tracking-widest">{title.toUpperCase()}</Text>{children}
  </View></Reveal>;
}
export default function TrendsScreen() {
  const owner = useAuthStore(s => s.session?.user.id);
  const profile = useAuthStore(s => s.profile);
  const targets = useNutritionStore(s => s.dailyTargets?.macros);
  const [days, setDays] = useState<number>(28);
  const today = localDateKey(new Date());
  const history = useQuery({
    enabled: !!owner, queryKey: ['history', owner, days, today],
    queryFn: () => loadHistory(owner!, shiftDate(today, -(days - 1)), today),
  });
  const rows: HistoryDay[] = useMemo(() => history.data ?? [], [history.data]);
  // The engine needs a 14–30 day smoothing window regardless of the range on screen.
  const estimate = useMemo(() => {
    try { return calculateTdee(rows, { windowDays: 28, asOfDate: today }); }
    catch { return null; }
  }, [rows, today]);
  const weights = rows.filter(r => r.body_weight_lbs !== null);
  const calories = rows.filter(r => r.calories_kcal !== null).map(r => ({ date: r.log_date, value: r.calories_kcal! }));
  const protein = rows.filter(r => r.proteinG !== null).map(r => ({ date: r.log_date, value: r.proteinG! }));
  const goalWeight = profile?.weight_lbs ?? null;
  const perDay = estimate?.weightChangeLbsPerDay ?? null;
  const averageProtein = protein.length ? protein.reduce((sum, p) => sum + p.value, 0) / protein.length : null;
  return <SafeAreaView edges={['top','left','right']} className="flex-1 bg-background">
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <Reveal index={0}>
        <Text className="text-sm font-bold tracking-widest">YOUR TRENDS</Text>
        <Text className="mb-1 mt-2 text-4xl font-bold">The longer view</Text>
        <Text className="mb-4">Single days are noisy. These are the lines that actually move.</Text>
        <View className="mb-4 flex-row flex-wrap">{RANGES.map(([value, label]) => <Choice key={value} label={label} selected={days === value} onPress={() => setDays(value)} />)}</View>
      </Reveal>
      {history.isPending && <LoadingCards label="Loading your history…" />}
      {history.isError && <Card title="History unavailable" index={1}><Text>We could not reach your cloud diary. Your device data is unaffected — try again when connected.</Text></Card>}
      {!history.isPending && !history.isError && <>
        <Card title="Weight trend" index={1}>
          <LineChart unit=" lbs" tone="protein"
            raw={weights.map(r => ({ date: r.log_date, value: r.body_weight_lbs! }))}
            trend={estimate?.weightTrend.map(p => ({ date: p.date, value: p.trendedWeightLbs })) ?? []}
            caption="Dots are daily weigh-ins; the line is the smoothed trend that filters out water and food weight." />
        </Card>
        <Card title="Adaptive expenditure" index={2}>
          {estimate?.status === 'ready' ? <>
            <Text className="text-4xl font-bold">{Math.round(estimate.tdeeKcal!)} kcal</Text>
            <Text className="mb-3 mt-1">Estimated daily expenditure from your logged intake and weight trend — not a target.</Text>
            <Text className="text-sm">Based on {estimate.adherentDays} complete days ({Math.round(estimate.coverage * 100)}% of the window).
              {perDay !== null && Math.abs(perDay) > .001 ? ` Trending ${perDay > 0 ? 'up' : 'down'} about ${Math.abs(perDay * 7).toFixed(2)} lbs per week.` : ' Weight is holding steady.'}</Text>
            {profile?.dynamic_tdee_kcal ? <Text className="mt-3 text-sm">Your onboarding estimate was {Math.round(profile.dynamic_tdee_kcal)} kcal. This measured figure is the better one once you have a few weeks of data.</Text> : null}
          </> : <>
            <Text className="text-xl font-bold">Still measuring</Text>
            <Text className="mt-2">This needs 14 days that have both a weigh-in and a complete food log, marked adherent. You have {estimate?.adherentDays ?? 0}.</Text>
            <Text className="mt-3 text-sm">Weigh in each morning and mark the day adherent once you have logged everything.</Text>
          </>}
        </Card>
        {perDay !== null && goalWeight !== null && Math.abs(perDay) > .002 && <Card title="Projection" index={3}>
          <Text>At the current trend you would reach {Math.round(goalWeight + perDay * 7 * 4)} lbs in about four weeks.</Text>
          <Text className="mt-2 text-sm">A projection from recent data, not a promise — it moves as your intake and activity change.</Text>
        </Card>}
        <Card title="Daily calories" index={4}>
          <BarChart series={calories} target={targets?.caloriesKcal ?? null} tone="carbs" />
          <Text className="mt-2 text-sm">{calories.length} days logged{targets ? '. The dashed line is your target; bars above it are over.' : '.'}</Text>
        </Card>
        <MeasurementsCard index={5} />
        <MilestonesCard items={milestones(summarizeStreak(rows, today), 0)} index={6} />
        <Card title="Consistency" index={7}>
          <View className="flex-row flex-wrap gap-5">
            <View><Text className="text-3xl font-bold">{rows.filter(r => r.is_adherent).length}</Text><Text className="text-sm">Adherent days</Text></View>
            <View><Text className="text-3xl font-bold">{estimate?.averageIntakeKcal ? Math.round(estimate.averageIntakeKcal) : '—'}</Text><Text className="text-sm">Avg intake kcal</Text></View>
            <View><Text className="text-3xl font-bold">{averageProtein ? Math.round(averageProtein) : '—'}</Text><Text className="text-sm">Avg protein g</Text></View>
          </View>
        </Card>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
