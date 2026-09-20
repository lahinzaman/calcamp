import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateTdee, weightTrendSeries, WEIGHT_TREND_WINDOW_DAYS } from '../nutrition/tdee';
import type { TdeeDailyLog } from '../nutrition/tdee';

const day = (n: number) => new Date(Date.UTC(2026, 8, 1) + n * 86_400_000).toISOString().slice(0, 10);
/** A week of weigh-ins with no food logged and nothing marked adherent — the common case. */
const week: TdeeDailyLog[] = Array.from({ length: 7 }, (_, i) => ({
  log_date: day(i), body_weight_lbs: 180 - i * 0.3, calories_kcal: null, is_adherent: false,
}));

test('a week of weigh-ins draws a trend even with nothing marked adherent', () => {
  // This is what was on screen instead: the expenditure estimate needs adherent days that also
  // carry a calorie total, and its trend was the only thing the chart was given.
  assert.deepEqual(calculateTdee(week, { asOfDate: day(6) }).weightTrend, [],
    'the expenditure trend is empty, correctly — those are its requirements');

  const trend = weightTrendSeries(week);
  assert.equal(trend.length, 7, 'but every weigh-in belongs on a chart of body weight');
  assert.equal(trend[0].trendedWeightLbs, 180, 'the line starts at the first measurement');
  assert.ok(trend[6].trendedWeightLbs < 180 && trend[6].trendedWeightLbs > 178.2,
    'and is smoothed, so it lags the raw drop without ignoring it');
  assert.deepEqual(trend.map(p => p.date), Array.from({ length: 7 }, (_, i) => day(i)));
});

test('two weigh-ins are already a line, and days without a weight are simply not points', () => {
  assert.equal(weightTrendSeries(week.slice(0, 2)).length, 2);
  assert.equal(weightTrendSeries(week.slice(0, 1)).length, 1);
  assert.deepEqual(weightTrendSeries([]), []);

  const patchy: TdeeDailyLog[] = [
    { log_date: day(0), body_weight_lbs: 180, calories_kcal: 2000, is_adherent: true },
    { log_date: day(1), body_weight_lbs: null, calories_kcal: 2100, is_adherent: true },
    { log_date: day(2), body_weight_lbs: 0, calories_kcal: null, is_adherent: false },
    { log_date: day(3), body_weight_lbs: 179, calories_kcal: null, is_adherent: false },
  ];
  assert.deepEqual(weightTrendSeries(patchy).map(p => p.date), [day(0), day(3)],
    'a missing weight, and a nonsensical one, are left out rather than charted as zero');
});

test('the smoothing responds inside a week rather than lagging a month behind', () => {
  const jump: TdeeDailyLog[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ log_date: day(i), body_weight_lbs: 180, calories_kcal: null, is_adherent: false })),
    // One heavy day: water and food, not fat. The line should move a little, not follow it.
    { log_date: day(6), body_weight_lbs: 186, calories_kcal: null, is_adherent: false },
  ];
  const short = weightTrendSeries(jump, WEIGHT_TREND_WINDOW_DAYS).at(-1)!.trendedWeightLbs;
  const long = weightTrendSeries(jump, 28).at(-1)!.trendedWeightLbs;
  assert.ok(short > 180 && short < 182.5, 'a week-long window absorbs most of a one-day spike');
  assert.ok(short > long, 'and still responds sooner than a month-long one');

  // A gap is a gap: two weights a fortnight apart are not adjacent days.
  const gapped: TdeeDailyLog[] = [
    { log_date: day(0), body_weight_lbs: 180, calories_kcal: null, is_adherent: false },
    { log_date: day(14), body_weight_lbs: 170, calories_kcal: null, is_adherent: false },
  ];
  assert.ok(weightTrendSeries(gapped).at(-1)!.trendedWeightLbs < 172,
    'after two weeks the old value has decayed away almost entirely');

  assert.throws(() => weightTrendSeries(week, 1), RangeError);
  assert.throws(() => weightTrendSeries(week, 91), RangeError);
});
