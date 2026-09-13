import { View } from 'react-native';
import { Text } from '../../theme/primitives';
import { ProgressBar, Reveal } from '../../theme/motion';
import { BarChart, LineChart } from '../../components/charts/LineChart';
import type { HistoryDay } from '../../api/history';
import type { BodyMeasurement } from '../../api/measurements';
import type { ActivityDay } from '../../api/activityHistory';
import type { TdeeEstimate } from '../nutrition/tdee';
import {
  bodyComposition, bodyFatSeries, consistency, energyBalance, goalProgress,
  macroSplit, nutrientAverages, stepsSummary, weeklyAverages,
} from './analytics';
import { nutrientStatuses, personalDailyValues, type MetabolicSex } from '../nutrition/dailyValues';
import { readUnits, showWeight, weightUnit } from '../settings/measurementUnits';
import { t as translate } from '../../i18n';

export function Card({ title, children, index }: { title: string; children: React.ReactNode; index: number }) {
  return <Reveal index={index}><View className="mb-4 rounded-3xl border border-border bg-surface p-5">
    <Text className="mb-3 text-sm font-bold tracking-widest">{title.toUpperCase()}</Text>{children}
  </View></Reveal>;
}
function Stat({ value, label }: { value: string; label: string }) {
  return <View style={{ flexGrow: 1, flexBasis: 110 }}>
    <Text className="text-3xl font-bold" style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
    <Text className="mt-0.5 text-sm">{label}</Text>
  </View>;
}
const signed = (value: number, unit: string, digits = 1) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)} ${unit}`;
/** Weight is stored in pounds; these cards show it in whichever system is chosen. */
const inUnits = (lbs: number) => showWeight(lbs, readUnits());
const unit = () => weightUnit(readUnits());

export function GoalProgressCard({ estimate, goalWeightLbs, index }: { estimate: TdeeEstimate | null; goalWeightLbs: number | null; index: number }) {
  const progress = goalProgress(estimate?.weightTrend ?? [], goalWeightLbs, estimate?.weightChangeLbsPerDay ?? null);
  if (!progress) return null;
  return <Card title={translate('trends.goalProgress')} index={index}>
    <View className="mb-3 flex-row items-end justify-between gap-3">
      <Text className="text-4xl font-bold">{Math.round(progress.percent * 100)}%</Text>
      <Text className="flex-1 text-right text-sm">{inUnits(progress.currentLbs)} → {inUnits(progress.goalLbs)} {unit()}</Text>
    </View>
    <ProgressBar value={progress.percent} target={1} height={12} tone={progress.wrongWay ? 'fat' : 'protein'} />
    <Text className="mt-3">
      {signed(inUnits(progress.movedLbs), unit())} since {progress.startDate}, with {Math.abs(inUnits(progress.remainingLbs))} {unit()} to go.
    </Text>
    {progress.wrongWay && <Text className="mt-2 text-sm">Your trend is moving away from this goal right now. That is information, not a verdict — check the calorie target before changing anything else.</Text>}
    {progress.weeksLeft !== null && <Text className="mt-2 text-sm">At the current trend that is about {Math.round(progress.weeksLeft)} more {Math.round(progress.weeksLeft) === 1 ? 'week' : 'weeks'}. It moves as your intake and activity move.</Text>}
    <Text className="mt-2 text-xs">Measured against your smoothed trend weight, not a single morning on the scale.</Text>
  </Card>;
}

export function EnergyBalanceCard({ rows, estimate, index }: { rows: readonly HistoryDay[]; estimate: TdeeEstimate | null; index: number }) {
  const balance = energyBalance(rows, estimate?.status === 'ready' ? estimate.tdeeKcal : null);
  if (!balance) return null;
  const actualLbs = estimate?.weightChangeLbsPerDay != null ? estimate.weightChangeLbsPerDay * balance.days.length : null;
  const surplus = balance.averageKcal >= 0;
  return <Card title={translate('trends.energyBalance')} index={index}>
    <Text className="text-4xl font-bold">{signed(balance.averageKcal, 'kcal', 0)}</Text>
    <Text className="mb-3 mt-1">Average daily {surplus ? 'surplus' : 'deficit'} across {balance.days.length} logged {balance.days.length === 1 ? 'day' : 'days'}, against your measured expenditure.</Text>
    <BarChart series={balance.days.map(day => ({ date: day.date, value: day.intakeKcal }))} target={estimate?.tdeeKcal ?? null} tone="protein" />
    <Text className="mt-2 text-sm">Bars are what you ate; the dashed line is what you burned.</Text>
    <View className="mt-4 flex-row flex-wrap gap-4">
      <Stat value={signed(inUnits(balance.predictedLbs), unit())} label="Predicted from balance" />
      {actualLbs !== null && <Stat value={signed(inUnits(actualLbs), unit())} label="Actual trend change" />}
    </View>
    {actualLbs !== null && <Text className="mt-3 text-sm">The two rarely match exactly. A gap usually means the logging is off somewhere, not that the arithmetic is — the scale is the measurement that settles it.</Text>}
  </Card>;
}

export function BodyCompositionCard({ measurements, weightLbs, index }: { measurements: readonly BodyMeasurement[]; weightLbs: number | null; index: number }) {
  const series = bodyFatSeries(measurements);
  if (!series.length) return null;
  const latest = series[series.length - 1];
  const first = series[0];
  const composition = bodyComposition(latest.value, weightLbs);
  return <Card title={translate('trends.bodyComposition')} index={index}>
    <Text className="text-4xl font-bold">{latest.value.toFixed(1)}%</Text>
    <Text className="mb-3 mt-1">Body fat recorded {latest.date}{series.length > 1 ? ` · ${signed(latest.value - first.value, 'pts')} since ${first.date}` : ''}.</Text>
    {series.length > 1 && <LineChart trend={series} unit="%" tone="fat" caption="Whatever you measure with, keep measuring the same way — the direction is the useful part, not the absolute number." />}
    {composition && <View className="mt-4 flex-row flex-wrap gap-4">
      <Stat value={`${inUnits(composition.leanMassLbs)}`} label={`Lean mass ${unit()}`} />
      <Stat value={`${inUnits(composition.fatMassLbs)}`} label={`Fat mass ${unit()}`} />
    </View>}
    {!composition && <Text className="mt-2 text-sm">Log a body weight and this splits into fat and lean mass.</Text>}
  </Card>;
}

export function StepsCard({ activity, index }: { activity: readonly ActivityDay[]; index: number }) {
  const steps = stepsSummary(activity);
  if (!steps) return <Card title={translate('trends.steps')} index={index}>
    <Text>No step data has synced yet. Connect Apple Health or Health Connect in Settings and your daily steps appear here.</Text>
  </Card>;
  return <Card title={translate('trends.steps')} index={index}>
    <Text className="text-4xl font-bold">{Math.round(steps.averageSteps).toLocaleString()}</Text>
    <Text className="mb-3 mt-1">Average per day across {steps.series.length} {steps.series.length === 1 ? 'day' : 'days'} with data.</Text>
    <BarChart series={steps.series} tone="carbs" />
    <View className="mt-4 flex-row flex-wrap gap-4">
      <Stat value={Math.round(steps.bestDay.value).toLocaleString()} label={`Best day · ${steps.bestDay.date}`} />
      <Stat value={Math.round(steps.totalSteps).toLocaleString()} label="Total steps" />
      {steps.activeEnergyKcal !== null && <Stat value={`${Math.round(steps.activeEnergyKcal)}`} label="Avg active kcal" />}
    </View>
    <Text className="mt-3 text-xs">Active energy from your phone or watch is already inside the measured expenditure above — do not add it on top.</Text>
  </Card>;
}

export function MacroSplitCard({ rows, bodyWeightLbs, index }: { rows: readonly HistoryDay[]; bodyWeightLbs: number | null; index: number }) {
  const split = macroSplit(rows, bodyWeightLbs);
  if (!split) return null;
  const parts = [['Protein', split.proteinPercent, 'protein'], ['Carbs', split.carbsPercent, 'carbs'], ['Fat', split.fatPercent, 'fat']] as const;
  return <Card title={translate('trends.macroSplit')} index={index}>
    {parts.map(([label, percent, tone]) => <View key={label} className="mb-3">
      <View className="mb-1 flex-row items-baseline justify-between gap-3">
        <Text className="flex-1 text-sm font-bold">{label}</Text>
        <Text className="text-sm" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(percent)}%</Text>
      </View>
      <ProgressBar value={percent} target={100} tone={tone} height={8} />
    </View>)}
    <Text className="mt-1 text-sm">Averaged over {split.days} fully logged {split.days === 1 ? 'day' : 'days'}.</Text>
    {split.proteinGPerLb !== null && <Text className="mt-2 text-sm">That is {split.proteinGPerLb.toFixed(2)} g of protein per lb of body weight. Most evidence lands between 0.7 and 1.0 g per lb for building muscle.</Text>}
  </Card>;
}

export function WeeklyAveragesCard({ rows, index }: { rows: readonly HistoryDay[]; index: number }) {
  const weeks = weeklyAverages(rows).filter(week => week.averageKcal !== null || week.averageWeightLbs !== null);
  if (weeks.length < 2) return null;
  return <Card title={translate('trends.weekByWeek')} index={index}>
    <Text className="mb-3 text-sm">Week-to-week is the smallest comparison that is mostly signal rather than noise.</Text>
    {weeks.slice(-8).reverse().map((week, position, all) => {
      const previous = all[position + 1];
      const kcalDelta = week.averageKcal !== null && previous?.averageKcal != null ? week.averageKcal - previous.averageKcal : null;
      const weightDelta = week.averageWeightLbs !== null && previous?.averageWeightLbs != null ? week.averageWeightLbs - previous.averageWeightLbs : null;
      return <View key={week.weekStart} className="mb-2 flex-row flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-raised px-4 py-3">
        <Text className="text-sm font-bold" style={{ flexGrow: 1, flexBasis: 110 }}>Week of {week.weekStart}</Text>
        <Text className="text-sm" style={{ fontVariant: ['tabular-nums'] }}>
          {week.averageKcal === null ? '— kcal' : `${Math.round(week.averageKcal)} kcal`}
          {kcalDelta !== null ? ` (${signed(kcalDelta, '', 0).trim()})` : ''}
          {week.averageWeightLbs !== null ? ` · ${inUnits(week.averageWeightLbs)} ${unit()}` : ''}
          {weightDelta !== null ? ` (${signed(inUnits(weightDelta), '').trim()})` : ''}
        </Text>
      </View>;
    })}
  </Card>;
}

export function ConsistencyCard({ rows, windowDays, estimate, averageProtein, index }: {
  rows: readonly HistoryDay[]; windowDays: number; estimate: TdeeEstimate | null; averageProtein: number | null; index: number;
}) {
  const stats = consistency(rows, windowDays);
  return <Card title={translate('trends.consistency')} index={index}>
    <View className="flex-row flex-wrap gap-5">
      <Stat value={`${Math.round(stats.loggedPercent)}%`} label={`Days logged (${stats.loggedDays}/${stats.windowDays})`} />
      <Stat value={String(stats.adherentDays)} label="Adherent days" />
      <Stat value={String(stats.weighInDays)} label="Weigh-ins" />
      <Stat value={estimate?.averageIntakeKcal ? String(Math.round(estimate.averageIntakeKcal)) : '—'} label="Avg intake kcal" />
      <Stat value={averageProtein ? String(Math.round(averageProtein)) : '—'} label="Avg protein g" />
    </View>
    <Text className="mt-3 text-sm">Expenditure is measured from days that have both a weigh-in and a complete log, so the weigh-in count is what limits it.</Text>
  </Card>;
}

export function NutrientAveragesCard({ rows, sex, age, index }: {
  rows: readonly HistoryDay[]; sex: MetabolicSex; age: number | null; index: number;
}) {
  const averages = nutrientAverages(rows);
  if (!averages.length) return null;
  const values = personalDailyValues({ sex, age });
  const consumed = Object.fromEntries(averages.map(entry => [entry.key, entry.averageAmount]));
  const { tracked } = nutrientStatuses(consumed, values);
  const byKey = new Map(averages.map(entry => [entry.key, entry.days]));
  const short = tracked.filter(status => status.kind === 'goal' && status.ratio < 0.8).sort((a, b) => a.ratio - b.ratio);
  const over = tracked.filter(status => status.kind === 'limit' && status.ratio > 1).sort((a, b) => b.ratio - a.ratio);
  return <Card title={translate('trends.nutrients')} index={index}>
    <Text className="mb-4 text-sm">Daily averages across the days that reported each nutrient — not across the whole range, which would punish you for a database that does not publish it.</Text>
    {[['Falling short', short], ['Over a limit', over]].map(([heading, list]) => {
      const entries = list as typeof tracked;
      if (!entries.length) return null;
      return <View key={heading as string} className="mb-4">
        <Text className="mb-2 text-sm font-bold">{heading as string}</Text>
        {entries.slice(0, 8).map(status => <View key={status.key} className="mb-3">
          <View className="mb-1 flex-row flex-wrap items-baseline justify-between gap-2">
            <Text className="font-semibold" style={{ flexGrow: 1, flexBasis: 120 }}>{status.label}</Text>
            <Text className="text-sm" style={{ fontVariant: ['tabular-nums'] }}>
              {Math.round(status.amount * 10) / 10} / {status.target} {status.unit.replace('_', ' ')} · {Math.round(status.ratio * 100)}%
            </Text>
          </View>
          <ProgressBar value={status.amount} target={status.target} height={6} tone={status.kind === 'limit' ? 'fat' : 'carbs'} />
          <Text className="mt-1 text-xs">{byKey.get(status.key)} {byKey.get(status.key) === 1 ? 'day' : 'days'} reported this</Text>
        </View>)}
      </View>;
    })}
    {!short.length && !over.length && <Text>Every nutrient with data sits inside its range across this window.</Text>}
  </Card>;
}
