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
import { loadActivity } from '../../api/activityHistory';
import { loadMeasurements } from '../../api/measurements';
import {
  BodyCompositionCard, ConsistencyCard, EnergyBalanceCard, GoalProgressCard,
  Card, MacroSplitCard, NutrientAveragesCard, StepsCard, WeeklyAveragesCard,
} from './AnalyticsCards';
import { calculateTdee, weightTrendSeries } from '../nutrition/tdee';
import { readPreferences } from '../notifications/preferences';
import { MilestonesCard } from '../habits/MilestonesCard';
import { MeasurementsCard } from './MeasurementsCard';
import { ProgressPhotoCard } from '../progress/ProgressPhotoCard';
import { milestones, summarizeStreak } from '../habits/streaks';
import { localDateKey } from '../../store/nutritionStore';
import { useT } from '../../i18n';
const RANGES = [[28, 'trends.range4'], [56, 'trends.range8'], [90, 'trends.range13']] as const;
export default function TrendsScreen() {
  const t = useT();
  const owner = useAuthStore(s => s.session?.user.id);
  const profile = useAuthStore(s => s.profile);
  const targets = useNutritionStore(s => s.dailyTargets?.macros);
  const [days, setDays] = useState<number>(28);
  const today = localDateKey(new Date());
  const from = shiftDate(today, -(days - 1));
  const history = useQuery({
    enabled: !!owner, queryKey: ['history', owner, days, today],
    queryFn: () => loadHistory(owner!, from, today),
  });
  const activity = useQuery({ enabled: !!owner, queryKey: ['activity', owner, days, today],
    queryFn: () => loadActivity(owner!, from, today), staleTime: 300_000 });
  const measurements = useQuery({ enabled: !!owner, queryKey: ['measurements-range', owner, days, today],
    queryFn: () => loadMeasurements(owner!, from, today), staleTime: 300_000 });
  const rows: HistoryDay[] = useMemo(() => history.data ?? [], [history.data]);
  // The engine needs a 14–30 day smoothing window regardless of the range on screen.
  const estimate = useMemo(() => {
    try { return calculateTdee(rows, { windowDays: 28, asOfDate: today }); }
    catch { return null; }
  }, [rows, today]);
  // Steps only reach this screen through the cloud, and only when health backup is switched on.
  const activityBackup = useMemo(() => owner ? readPreferences(owner).uploadActivity : undefined, [owner]);
  const weights = rows.filter(r => r.body_weight_lbs !== null);
  // Drawn from every weigh-in, not only the adherent days with a calorie total that the
  // expenditure estimate needs — those are its requirements, not the chart's.
  const weightTrend = useMemo(() => {
    try { return weightTrendSeries(rows); } catch { return []; }
  }, [rows]);
  const calories = rows.filter(r => r.calories_kcal !== null).map(r => ({ date: r.log_date, value: r.calories_kcal! }));
  const protein = rows.filter(r => r.proteinG !== null).map(r => ({ date: r.log_date, value: r.proteinG! }));
  const survey = profile?.lifestyle_survey as { goalWeightLbs?: number | null; age?: number | null; metabolicSex?: 'female' | 'male' | 'unspecified' } | null | undefined;
  const goalWeight = survey?.goalWeightLbs ?? null;
  const latestWeight = weights.length ? weights[weights.length - 1].body_weight_lbs : null;
  const perDay = estimate?.weightChangeLbsPerDay ?? null;
  const averageProtein = protein.length ? protein.reduce((sum, p) => sum + p.value, 0) / protein.length : null;
  return <SafeAreaView edges={['top','left','right']} className="flex-1 bg-background">
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <Reveal index={0}>
        <Text className="text-sm font-bold tracking-widest">{t('trends.eyebrow')}</Text>
        <Text className="mb-1 mt-2 text-4xl font-bold">{t('trends.title')}</Text>
        <Text className="mb-4">{t('trends.subtitle')}</Text>
        <View className="mb-4 flex-row flex-wrap">{RANGES.map(([value, key]) => <Choice key={value} label={t(key)} selected={days === value} onPress={() => setDays(value)} />)}</View>
      </Reveal>
      {history.isLoading && <LoadingCards label={t('trends.loading')} />}
      {history.isError && <Card title={t('trends.historyUnavailable')} index={1}><Text>{t('trends.cloudUnavailable')}</Text></Card>}
      {!history.isLoading && !history.isError && <>
        <Card title={t('trends.weightTrend')} index={1}>
          <LineChart unit=" lbs" tone="protein"
            raw={weights.map(r => ({ date: r.log_date, value: r.body_weight_lbs! }))}
            trend={weightTrend.map(p => ({ date: p.date, value: p.trendedWeightLbs }))}
            caption="Dots are daily weigh-ins; the line is the smoothed trend that filters out water and food weight." />
        </Card>
        <Card title={t('trends.expenditure')} index={2}>
          {estimate?.status === 'ready' ? <>
            <Text className="text-4xl font-bold">{Math.round(estimate.tdeeKcal!)} kcal</Text>
            <Text className="mb-3 mt-1">{t('trends.expenditureNote')}</Text>
            <Text className="text-sm">Based on {estimate.adherentDays} complete days ({Math.round(estimate.coverage * 100)}% of the window).
              {perDay !== null && Math.abs(perDay) > .001 ? ` Trending ${perDay > 0 ? 'up' : 'down'} about ${Math.abs(perDay * 7).toFixed(2)} lbs per week.` : ' Weight is holding steady.'}</Text>
            {profile?.dynamic_tdee_kcal ? <Text className="mt-3 text-sm">Your onboarding estimate was {Math.round(profile.dynamic_tdee_kcal)} kcal. This measured figure is the better one once you have a few weeks of data.</Text> : null}
          </> : <>
            <Text className="text-xl font-bold">{t('trends.stillMeasuring')}</Text>
            <Text className="mt-2">This needs 14 days that have both a weigh-in and a complete food log, marked adherent. You have {estimate?.adherentDays ?? 0}.</Text>
            <Text className="mt-3 text-sm">{t('trends.weighInNote')}</Text>
          </>}
        </Card>
        <GoalProgressCard estimate={estimate} goalWeightLbs={goalWeight} index={3} />
        {perDay !== null && latestWeight !== null && Math.abs(perDay) > .002 && <Card title="Projection" index={4}>
          <Text>At the current trend you would reach {Math.round(latestWeight + perDay * 7 * 4)} lbs in about four weeks.</Text>
          <Text className="mt-2 text-sm">A projection from recent data, not a promise — it moves as your intake and activity change.</Text>
        </Card>}
        <EnergyBalanceCard rows={rows} estimate={estimate} index={5} />
        <Card title={t('trends.dailyCalories')} index={6}>
          <BarChart series={calories} target={targets?.caloriesKcal ?? null} tone="carbs" />
          <Text className="mt-2 text-sm">{calories.length} days logged{targets ? '. The dashed line is your target; bars above it are over.' : '.'}</Text>
        </Card>
        <MacroSplitCard rows={rows} bodyWeightLbs={latestWeight} index={7} />
        <NutrientAveragesCard rows={rows} sex={survey?.metabolicSex ?? 'unspecified'} age={survey?.age ?? null} index={8} />
        <StepsCard activity={activity.data ?? []} index={8} backupEnabled={activityBackup} />
        <BodyCompositionCard measurements={measurements.data ?? []} weightLbs={latestWeight} index={9} />
        <ProgressPhotoCard index={10} />
        <WeeklyAveragesCard rows={rows} index={10} />
        <MeasurementsCard index={11} />
        <MilestonesCard items={milestones(summarizeStreak(rows, today), 0)} index={12} />
        <ConsistencyCard rows={rows} windowDays={days} estimate={estimate} averageProtein={averageProtein} index={13} />
      </>}
    </ScrollView>
  </SafeAreaView>;
}
