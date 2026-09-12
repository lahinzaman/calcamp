import type { HistoryDay } from '../../api/history';
import type { BodyMeasurement } from '../../api/measurements';
import type { ActivityDay } from '../../api/activityHistory';

/** The conventional energy density of stored body mass. A planning figure, not a law. */
export const KCAL_PER_LB = 3500;

export interface EnergyBalanceDay { date: string; intakeKcal: number; expenditureKcal: number; balanceKcal: number }
export interface EnergyBalance {
  days: EnergyBalanceDay[]; totalKcal: number; averageKcal: number;
  /** What that cumulative balance predicts, which is not the same as what the scale says. */
  predictedLbs: number;
}
/**
 * Intake minus expenditure for every day that has both. Days without a food log are left
 * out rather than counted as a zero-calorie day, which would invent an enormous deficit.
 */
export function energyBalance(rows: readonly HistoryDay[], expenditureKcal: number | null): EnergyBalance | null {
  if (expenditureKcal === null || !Number.isFinite(expenditureKcal) || expenditureKcal <= 0) return null;
  const days = rows.filter(row => row.calories_kcal !== null && row.calories_kcal > 0)
    .map(row => ({ date: row.log_date, intakeKcal: row.calories_kcal!, expenditureKcal, balanceKcal: row.calories_kcal! - expenditureKcal }));
  if (!days.length) return null;
  const totalKcal = days.reduce((sum, day) => sum + day.balanceKcal, 0);
  return { days, totalKcal, averageKcal: totalKcal / days.length, predictedLbs: totalKcal / KCAL_PER_LB };
}

export type GoalDirectionLabel = 'lose' | 'gain' | 'hold';
export interface GoalProgress {
  startLbs: number; startDate: string; currentLbs: number; goalLbs: number;
  direction: GoalDirectionLabel; movedLbs: number; neededLbs: number;
  /** 0–1, clamped: overshooting a goal does not read as 140% complete. */
  percent: number; remainingLbs: number; weeksLeft: number | null; wrongWay: boolean;
}
export function goalProgress(trend: readonly { date: string; trendedWeightLbs: number }[], goalLbs: number | null,
  lbsPerDay: number | null): GoalProgress | null {
  if (goalLbs === null || !Number.isFinite(goalLbs) || trend.length < 2) return null;
  const first = trend[0]; const last = trend[trend.length - 1];
  const neededLbs = goalLbs - first.trendedWeightLbs;
  if (Math.abs(neededLbs) < 0.1) return null;
  const movedLbs = last.trendedWeightLbs - first.trendedWeightLbs;
  const remainingLbs = goalLbs - last.trendedWeightLbs;
  const direction: GoalDirectionLabel = neededLbs < 0 ? 'lose' : 'gain';
  // Progress is signed against the direction you need, so drifting the wrong way reads as zero.
  const percent = Math.max(0, Math.min(1, movedLbs / neededLbs));
  const closing = lbsPerDay !== null && Math.abs(lbsPerDay) > 0.0005 && Math.sign(lbsPerDay) === Math.sign(neededLbs);
  return {
    startLbs: first.trendedWeightLbs, startDate: first.date, currentLbs: last.trendedWeightLbs, goalLbs,
    direction, movedLbs, neededLbs, percent, remainingLbs,
    weeksLeft: closing ? Math.abs(remainingLbs / (lbsPerDay! * 7)) : null,
    wrongWay: movedLbs !== 0 && Math.sign(movedLbs) !== Math.sign(neededLbs),
  };
}

export interface Point { date: string; value: number }
export const bodyFatSeries = (measurements: readonly BodyMeasurement[]): Point[] =>
  measurements.filter(row => typeof row.body_fat_percent === 'number')
    .map(row => ({ date: row.measured_on, value: row.body_fat_percent as number }));
/** Splits scale weight into fat and lean mass. Only as good as the body-fat figure fed in. */
export function bodyComposition(bodyFatPercent: number | null, weightLbs: number | null) {
  if (bodyFatPercent === null || weightLbs === null || bodyFatPercent <= 0 || bodyFatPercent >= 100 || weightLbs <= 0) return null;
  const fatMassLbs = weightLbs * (bodyFatPercent / 100);
  return { fatMassLbs, leanMassLbs: weightLbs - fatMassLbs };
}

export interface StepsSummary { series: Point[]; averageSteps: number; bestDay: Point; totalSteps: number; activeEnergyKcal: number | null }
export function stepsSummary(rows: readonly ActivityDay[]): StepsSummary | null {
  const series = rows.filter(row => row.steps !== null).map(row => ({ date: row.activity_date, value: row.steps! }));
  if (!series.length) return null;
  const totalSteps = series.reduce((sum, point) => sum + point.value, 0);
  const energyDays = rows.filter(row => row.active_energy_kcal !== null);
  return {
    series, totalSteps, averageSteps: totalSteps / series.length,
    bestDay: series.reduce((best, point) => point.value > best.value ? point : best, series[0]),
    activeEnergyKcal: energyDays.length ? energyDays.reduce((sum, row) => sum + row.active_energy_kcal!, 0) / energyDays.length : null,
  };
}

export interface MacroSplit { proteinPercent: number; carbsPercent: number; fatPercent: number; days: number; proteinGPerLb: number | null }
/** Share of energy from each macro, computed from the macros rather than the logged calories. */
export function macroSplit(rows: readonly HistoryDay[], bodyWeightLbs: number | null): MacroSplit | null {
  const complete = rows.filter(row => row.proteinG !== null && row.carbsG !== null && row.fatG !== null);
  if (!complete.length) return null;
  const protein = complete.reduce((sum, row) => sum + row.proteinG!, 0) / complete.length;
  const carbs = complete.reduce((sum, row) => sum + row.carbsG!, 0) / complete.length;
  const fat = complete.reduce((sum, row) => sum + row.fatG!, 0) / complete.length;
  const energy = protein * 4 + carbs * 4 + fat * 9;
  if (energy <= 0) return null;
  return {
    proteinPercent: (protein * 4) / energy * 100, carbsPercent: (carbs * 4) / energy * 100,
    fatPercent: (fat * 9) / energy * 100, days: complete.length,
    proteinGPerLb: bodyWeightLbs && bodyWeightLbs > 0 ? protein / bodyWeightLbs : null,
  };
}

export interface WeekAverage { weekStart: string; averageKcal: number | null; averageWeightLbs: number | null; days: number }
const mondayOf = (date: string) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - ((parsed.getUTCDay() + 6) % 7));
  return parsed.toISOString().slice(0, 10);
};
/** Weekly means, because week-to-week is the smallest comparison that is not mostly noise. */
export function weeklyAverages(rows: readonly HistoryDay[]): WeekAverage[] {
  const buckets = new Map<string, HistoryDay[]>();
  for (const row of rows) {
    const week = mondayOf(row.log_date);
    const bucket = buckets.get(week);
    if (bucket) bucket.push(row); else buckets.set(week, [row]);
  }
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, days]) => ({
    weekStart,
    averageKcal: mean(days.filter(day => day.calories_kcal !== null && day.calories_kcal > 0).map(day => day.calories_kcal!)),
    averageWeightLbs: mean(days.filter(day => day.body_weight_lbs !== null).map(day => day.body_weight_lbs!)),
    days: days.length,
  }));
}

export interface Consistency { loggedDays: number; adherentDays: number; weighInDays: number; windowDays: number; loggedPercent: number }
export function consistency(rows: readonly HistoryDay[], windowDays: number): Consistency {
  const loggedDays = rows.filter(row => row.calories_kcal !== null && row.calories_kcal > 0).length;
  return {
    loggedDays, windowDays,
    adherentDays: rows.filter(row => row.is_adherent).length,
    weighInDays: rows.filter(row => row.body_weight_lbs !== null).length,
    loggedPercent: windowDays > 0 ? (loggedDays / windowDays) * 100 : 0,
  };
}
