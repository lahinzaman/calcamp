import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  KCAL_PER_LB, bodyComposition, bodyFatSeries, consistency, energyBalance,
  goalProgress, macroSplit, stepsSummary, weeklyAverages,
} from '../insights/analytics';
import type { HistoryDay } from '../../api/history';

const day = (log_date: string, calories_kcal: number | null, over: Partial<HistoryDay> = {}): HistoryDay => ({
  log_date, calories_kcal, proteinG: 150, carbsG: 200, fatG: 60, is_adherent: true, body_weight_lbs: 180, ...over,
});

test('energy balance skips unlogged days instead of scoring them as a total fast', () => {
  const rows = [day('2026-09-01', 2000), day('2026-09-02', null), day('2026-09-03', 2400)];
  const balance = energyBalance(rows, 2200)!;
  assert.equal(balance.days.length, 2);
  assert.equal(balance.totalKcal, 0);
  assert.equal(balance.averageKcal, 0);
  assert.equal(energyBalance(rows, null), null);
  assert.equal(energyBalance([day('2026-09-01', null)], 2200), null);
});

test('a cumulative balance converts to pounds at the conventional energy density', () => {
  const balance = energyBalance([day('2026-09-01', 1500), day('2026-09-02', 1500)], 2200)!;
  assert.equal(balance.totalKcal, -1400);
  assert.equal(balance.predictedLbs, -1400 / KCAL_PER_LB);
});

const trend = (from: number, to: number) => [
  { date: '2026-08-15', trendedWeightLbs: from }, { date: '2026-09-11', trendedWeightLbs: to }];

test('goal progress is signed against the direction you need, and clamps at both ends', () => {
  // Losing 10 of the 20 lbs you set out to lose is halfway there.
  const half = goalProgress(trend(200, 190), 180, -0.05)!;
  assert.equal(half.direction, 'lose');
  assert.ok(Math.abs(half.percent - 0.5) < 1e-9);
  assert.equal(half.remainingLbs, -10);
  assert.equal(half.wrongWay, false);
  assert.ok(half.weeksLeft !== null && Math.abs(half.weeksLeft - 10 / 0.35) < 0.01);
  // Overshooting reads as complete, never as 140%.
  assert.equal(goalProgress(trend(200, 172), 180, -0.05)!.percent, 1);
  // Drifting the wrong way reads as no progress, and says so.
  const wrong = goalProgress(trend(200, 206), 180, 0.05)!;
  assert.equal(wrong.percent, 0);
  assert.equal(wrong.wrongWay, true);
  assert.equal(wrong.weeksLeft, null, 'a trend moving away from the goal has no arrival date');
});

test('goal progress needs a goal, two points, and a gap worth tracking', () => {
  assert.equal(goalProgress(trend(200, 190), null, -0.05), null);
  assert.equal(goalProgress([{ date: '2026-09-11', trendedWeightLbs: 200 }], 180, -0.05), null);
  assert.equal(goalProgress(trend(180, 179), 180, -0.05), null, 'already at the goal is not progress to report');
});

test('body composition splits scale weight only when both halves are known and sane', () => {
  assert.deepEqual(bodyComposition(20, 200), { fatMassLbs: 40, leanMassLbs: 160 });
  for (const [fat, weight] of [[null, 200], [20, null], [0, 200], [100, 200], [20, 0]] as const) {
    assert.equal(bodyComposition(fat, weight), null, `${fat}/${weight}`);
  }
  assert.deepEqual(bodyFatSeries([
    { id: '1', measured_on: '2026-09-01', note: null, body_fat_percent: 22 },
    { id: '2', measured_on: '2026-09-08', note: null, waist_in: 32 },
  ]), [{ date: '2026-09-01', value: 22 }]);
});

test('steps summarise only the days a device actually reported', () => {
  const summary = stepsSummary([
    { activity_date: '2026-09-01', steps: 8000, active_energy_kcal: 400, source: 'healthkit' },
    { activity_date: '2026-09-02', steps: null, active_energy_kcal: null, source: 'healthkit' },
    { activity_date: '2026-09-03', steps: 12000, active_energy_kcal: 600, source: 'healthkit' },
  ])!;
  assert.equal(summary.series.length, 2);
  assert.equal(summary.averageSteps, 10000);
  assert.equal(summary.bestDay.date, '2026-09-03');
  assert.equal(summary.totalSteps, 20000);
  assert.equal(summary.activeEnergyKcal, 500);
  assert.equal(stepsSummary([]), null);
});

test('the macro split comes from the macros, not from the logged calorie figure', () => {
  // 100 g protein, 100 g carbs, 44.4 g fat is 400/400/400 kcal: an even third each.
  const split = macroSplit([day('2026-09-01', 9999, { proteinG: 100, carbsG: 100, fatG: 400 / 9 })], 200)!;
  assert.ok(Math.abs(split.proteinPercent - 100 / 3) < 1e-6);
  assert.ok(Math.abs(split.fatPercent - 100 / 3) < 1e-6);
  assert.equal(split.proteinGPerLb, 0.5);
  assert.equal(macroSplit([day('2026-09-01', 2000, { proteinG: null })], 200), null);
  assert.equal(macroSplit([day('2026-09-01', 2000, { proteinG: 0, carbsG: 0, fatG: 0 })], 200), null);
});

test('weekly averages bucket Monday to Sunday and ignore missing values', () => {
  const weeks = weeklyAverages([
    day('2026-09-07', 2000, { body_weight_lbs: 180 }), day('2026-09-13', 2400, { body_weight_lbs: 182 }),
    day('2026-09-14', 2200, { body_weight_lbs: null }), day('2026-09-15', null, { body_weight_lbs: 181 }),
  ]);
  assert.deepEqual(weeks.map(week => week.weekStart), ['2026-09-07', '2026-09-14']);
  assert.equal(weeks[0].averageKcal, 2200);
  assert.equal(weeks[0].averageWeightLbs, 181);
  assert.equal(weeks[1].averageKcal, 2200);
  assert.equal(weeks[1].averageWeightLbs, 181);
});

test('consistency is measured against the window, not against the rows that came back', () => {
  const stats = consistency([day('2026-09-01', 2000), day('2026-09-02', null, { is_adherent: false, body_weight_lbs: null })], 28);
  assert.deepEqual({ ...stats, loggedPercent: undefined },
    { loggedDays: 1, adherentDays: 1, weighInDays: 1, windowDays: 28, loggedPercent: undefined });
  assert.ok(Math.abs(stats.loggedPercent - 100 / 28) < 1e-9);
  assert.equal(consistency([], 0).loggedPercent, 0, 'an empty window never divides by zero');
});
