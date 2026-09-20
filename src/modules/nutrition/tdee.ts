const MS_PER_DAY = 86_400_000;
export const POUNDS_PER_KG = 2.2046226218;
export const KCAL_PER_POUND = 3500;

/** Numeric projection of daily_nutrition_logs; convert database kilograms to pounds before calling. */
export interface TdeeDailyLog {
  log_date: string;
  body_weight_lbs: number | null;
  calories_kcal: number | null;
  is_adherent: boolean;
}

export interface WeightTrendPoint {
  date: string;
  weightLbs: number;
  trendedWeightLbs: number;
}

export interface TdeeEstimate {
  status: 'ready' | 'insufficient-data' | 'invalid-estimate';
  tdeeKcal: number | null;
  averageIntakeKcal: number | null;
  weightChangeLbsPerDay: number | null;
  storedEnergyChangeKcalPerDay: number | null;
  adherentDays: number;
  coverage: number;
  weightTrend: WeightTrendPoint[];
}

function dayNumber(date: string): number {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new RangeError('Use a valid YYYY-MM-DD log date.');
  }
  return timestamp / MS_PER_DAY;
}

function validateWindow(windowDays: number) {
  if (!Number.isInteger(windowDays) || windowDays < 14 || windowDays > 30) {
    throw new RangeError('The smoothing window must be 14–30 days.');
  }
}

/** Standard daily EMA: alpha=2/(span+1); returns a new array without mutating input. */
export function exponentialMovingAverage(values: readonly number[], span = 14): number[] {
  validateWindow(span);
  const alpha = 2 / (span + 1);
  return values.reduce<number[]>((trend, value, index) => {
    if (!Number.isFinite(value)) throw new RangeError('EMA values must be finite.');
    trend.push(index === 0 ? value : alpha * value + (1 - alpha) * trend[index - 1]);
    return trend;
  }, []);
}

/**
 * Descriptive energy-balance estimate, not a prescribed intake target.
 * Only adherent rows with BOTH intake and weight enter the EMA/regression/intake
 * average. Real elapsed days are used across gaps; unlogged days are never zero.
 * 3500 kcal/lb is the requested approximation, not a physiological constant.
 * Missing days reduce coverage; this cannot recover their unobserved intake.
 */
export function calculateTdee(
  logs: readonly TdeeDailyLog[],
  options: { windowDays?: number; asOfDate?: string } = {},
): TdeeEstimate {
  const windowDays = options.windowDays ?? 28;
  validateWindow(windowDays);
  const dated = logs.map((log) => ({ log, day: dayNumber(log.log_date) }));
  const end = options.asOfDate ? dayNumber(options.asOfDate)
    : dated.length ? Math.max(...dated.map(({ day }) => day)) : 0;
  const eligible = dated.filter(({ log, day }) => day <= end && day > end - windowDays
    && log.is_adherent && log.body_weight_lbs !== null && log.calories_kcal !== null)
    .sort((a, b) => a.day - b.day);
  const seen = new Set<number>();
  for (const { log, day } of eligible) {
    if (seen.has(day)) throw new RangeError('Duplicate adherent log date.');
    seen.add(day);
    if (!Number.isFinite(log.body_weight_lbs) || log.body_weight_lbs! <= 0
      || !Number.isFinite(log.calories_kcal) || log.calories_kcal! < 0) {
      throw new RangeError('Adherent weights must be positive and intakes nonnegative, finite numbers.');
    }
  }
  const alpha = 2 / (windowDays + 1);
  const weightTrend: WeightTrendPoint[] = [];
  eligible.forEach(({ log, day }, index) => {
    const weightLbs = log.body_weight_lbs!;
    // Compound decay over calendar gaps rather than treating two distant weights as adjacent days.
    const elapsedAlpha = index ? 1 - (1 - alpha) ** (day - eligible[index - 1].day) : 1;
    weightTrend.push({
      date: log.log_date,
      weightLbs,
      trendedWeightLbs: index
        ? elapsedAlpha * weightLbs + (1 - elapsedAlpha) * weightTrend[index - 1].trendedWeightLbs
        : weightLbs,
    });
  });
  const averageIntakeKcal = eligible.length
    ? eligible.reduce((sum, { log }) => sum + log.calories_kcal!, 0) / eligible.length : null;
  const base = { averageIntakeKcal, adherentDays: eligible.length, coverage: eligible.length / windowDays, weightTrend };
  // Fourteen actual paired observations, not merely two dates fourteen days apart.
  if (eligible.length < 14) return {
    ...base, status: 'insufficient-data', tdeeKcal: null,
    weightChangeLbsPerDay: null, storedEnergyChangeKcalPerDay: null,
  };
  const x = eligible.map(({ day }) => day - eligible[0].day);
  const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
  const meanY = weightTrend.reduce((sum, point) => sum + point.trendedWeightLbs, 0) / x.length;
  const slope = x.reduce((sum, value, i) => sum + (value - meanX) * (weightTrend[i].trendedWeightLbs - meanY), 0)
    / x.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  const storedEnergyChangeKcalPerDay = slope * KCAL_PER_POUND;
  const estimate = averageIntakeKcal! - storedEnergyChangeKcalPerDay;
  const valid = Number.isFinite(estimate) && estimate > 0;
  return {
    ...base, status: valid ? 'ready' : 'invalid-estimate',
    tdeeKcal: valid ? estimate : null, weightChangeLbsPerDay: slope, storedEnergyChangeKcalPerDay,
  };
}

/** A week of weigh-ins is enough to smooth water and food weight out of a line. */
export const WEIGHT_TREND_WINDOW_DAYS = 7;
/**
 * The smoothed weight line, from every weigh-in there is.
 *
 * `calculateTdee` builds its own trend from *adherent* days that also carry a calorie total,
 * because that is what estimating expenditure requires — pair a weight with what was eaten. A
 * chart of body weight has no such need, and tying it to that eligibility is why someone who
 * weighed in daily for a week saw "not enough data": their days were not marked adherent, or
 * they had not logged food, so the line had no points and the card drew nothing at all.
 *
 * Over a shorter window too, so the line responds within the first week rather than lagging a
 * month behind. The dots are the weigh-ins; this is only what is drawn through them.
 */
export function weightTrendSeries(
  logs: readonly TdeeDailyLog[],
  windowDays: number = WEIGHT_TREND_WINDOW_DAYS,
): WeightTrendPoint[] {
  if (!Number.isInteger(windowDays) || windowDays < 2 || windowDays > 90) {
    throw new RangeError('The weight smoothing window must be 2–90 days.');
  }
  const weighed = logs
    .filter(log => log.body_weight_lbs !== null && Number.isFinite(log.body_weight_lbs) && log.body_weight_lbs! > 0)
    .map(log => ({ log, day: dayNumber(log.log_date) }))
    .sort((a, b) => a.day - b.day);
  const alpha = 2 / (windowDays + 1);
  const trend: WeightTrendPoint[] = [];
  weighed.forEach(({ log, day }, index) => {
    const weightLbs = log.body_weight_lbs!;
    // Compound decay over calendar gaps, so a fortnight's break is not treated as one day.
    const elapsedAlpha = index ? 1 - (1 - alpha) ** (day - weighed[index - 1].day) : 1;
    trend.push({
      date: log.log_date, weightLbs,
      trendedWeightLbs: index
        ? elapsedAlpha * weightLbs + (1 - elapsedAlpha) * trend[index - 1].trendedWeightLbs
        : weightLbs,
    });
  });
  return trend;
}
