import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  KCAL_PER_LB, bodyComposition, bodyFatSeries, consistency, energyBalance,
  goalProgress, macroSplit, stepsSummary, weeklyAverages,
} from '../insights/analytics';
import type { HistoryDay } from '../../api/history';

const day = (log_date: string, calories_kcal: number | null, over: Partial<HistoryDay> = {}): HistoryDay => ({
  log_date, calories_kcal, proteinG: 150, carbsG: 200, fatG: 60, micros: {}, is_adherent: true, body_weight_lbs: 180, ...over,
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

test('every nutrient the panel tracks explains itself and has a sane reference amount', async () => {
  const { DAILY_VALUES, nutrientStatuses } = await import('../nutrition/dailyValues');
  const { NUTRIENT_UNITS } = await import('../../types/nutrition');
  const entries = Object.entries(DAILY_VALUES);
  assert.ok(entries.length >= 35);
  for (const [key, value] of entries) {
    assert.ok(value!.why.length > 20, `${key} has no description`);
    assert.ok(value!.amount > 0, `${key} needs a positive reference amount`);
    assert.ok(key in NUTRIENT_UNITS, `${key} is not a storable nutrient`);
  }
  // The vitamins and minerals a general-purpose tracker is expected to cover.
  for (const key of ['vitamin_a_mcg_rae', 'vitamin_c_mg', 'vitamin_d_mcg', 'vitamin_e_mg', 'vitamin_k_mcg',
    'thiamin_b1_mg', 'riboflavin_b2_mg', 'niacin_b3_mg', 'pantothenic_acid_b5_mg', 'vitamin_b6_mg',
    'biotin_b7_mcg', 'folate_b9_mcg_dfe', 'vitamin_b12_mcg', 'choline_mg',
    'calcium_mg', 'phosphorus_mg', 'magnesium_mg', 'potassium_mg', 'sodium_mg', 'chloride_mg', 'iron_mg',
    'zinc_mg', 'copper_mg', 'iodine_mcg', 'selenium_mcg', 'manganese_mg', 'fluoride_mg', 'chromium_mcg', 'molybdenum_mcg']) {
    assert.ok(key in DAILY_VALUES, `${key} is missing a daily value`);
  }
  // A nutrient nothing reported stays out of the scored list rather than sitting at 0%.
  const { tracked, unreported } = nutrientStatuses({ vitamin_c_mg: 45 });
  assert.deepEqual(tracked.map(status => status.key), ['vitamin_c_mg']);
  assert.equal(tracked[0].ratio, 0.5);
  assert.equal(tracked.length + unreported.length, entries.length);
  assert.ok(unreported.every(status => status.amount === 0 && status.why.length > 20));
});

test('nutrient targets follow sex and age rather than one label figure', async () => {
  const { DAILY_VALUES, personalDailyValues } = await import('../nutrition/dailyValues');
  const woman = personalDailyValues({ sex: 'female', age: 22 });
  const man = personalDailyValues({ sex: 'male', age: 22 });
  // The flat label value was a man's on every one of these.
  assert.equal(woman.vitamin_a_mcg_rae!.amount, 700);
  assert.equal(man.vitamin_a_mcg_rae!.amount, 900);
  assert.equal(woman.choline_mg!.amount, 425);
  assert.equal(woman.magnesium_mg!.amount, 310);
  assert.equal(woman.potassium_mg!.amount, 2600);
  assert.equal(woman.iron_mg!.amount, 18);
  // Age bands move where the DRI tables move.
  assert.equal(personalDailyValues({ sex: 'female', age: 45 }).magnesium_mg!.amount, 320);
  assert.equal(personalDailyValues({ sex: 'female', age: 45 }).iron_mg!.amount, 8);
  assert.equal(personalDailyValues({ sex: 'male', age: 45 }).vitamin_b6_mg!.amount, 1.7);
  // Nutrients with one value for everyone are untouched, as is an unstated sex.
  assert.equal(woman.vitamin_b12_mcg!.amount, man.vitamin_b12_mcg!.amount);
  assert.equal(personalDailyValues({ sex: 'unspecified', age: 22 }), DAILY_VALUES);
  for (const table of [woman, man]) {
    for (const [key, value] of Object.entries(table)) assert.ok(value!.amount > 0 && value!.why.length > 20, key);
  }
});

test('nutrient averages divide by the days that reported a nutrient, not the whole window', async () => {
  const { nutrientAverages } = await import('../insights/analytics');
  const rows = [
    day('2026-09-01', 2000, { micros: { iron_mg: 10, vitamin_c_mg: 60 } }),
    day('2026-09-02', 2000, { micros: { iron_mg: 20 } }),
    day('2026-09-03', 2000, { micros: {} }),
    day('2026-09-04', 2000, { micros: { iron_mg: -5, zinc_mg: Number.NaN } }),
  ];
  const averages = nutrientAverages(rows);
  const iron = averages.find(entry => entry.key === 'iron_mg')!;
  assert.equal(iron.averageAmount, 15);
  assert.equal(iron.days, 2, 'the day with no reading and the impossible reading are both skipped');
  assert.equal(averages.find(entry => entry.key === 'vitamin_c_mg')!.averageAmount, 60);
  assert.equal(averages.some(entry => entry.key === 'zinc_mg'), false);
  assert.deepEqual(nutrientAverages([]), []);
});

