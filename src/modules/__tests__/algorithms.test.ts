import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateTdee, exponentialMovingAverage, POUNDS_PER_KG, type TdeeDailyLog } from '../nutrition/tdee';
import { estimateBrzyckiOneRepMax } from '../workout/oneRepMax';
import { foodLogAmounts } from '../dining/logFood';
import type { DailyMenuItem } from '../../types/nutrislice';

const logs = (slope = 0): TdeeDailyLog[] => Array.from({ length: 28 }, (_, index) => ({
  log_date: `2026-08-${String(index + 1).padStart(2, '0')}`,
  body_weight_lbs: 180 + slope * index,
  calories_kcal: 2200,
  is_adherent: true,
}));

test('EMA weights recent observations, preserves input, and validates the span', () => {
  const source = [100, 115, 100];
  assert.deepEqual(exponentialMovingAverage(source, 14), [100, 102, 101.73333333333333]);
  assert.deepEqual(source, [100, 115, 100]);
  assert.deepEqual(exponentialMovingAverage([]), []);
  assert.throws(() => exponentialMovingAverage(source, 7));
});

test('stable weight returns intake; weight loss raises TDEE and gain lowers it', () => {
  const stable = calculateTdee(logs());
  assert.equal(stable.status, 'ready');
  assert.ok(Math.abs(stable.tdeeKcal! - 2200) < 1e-8);
  const loss = calculateTdee(logs(-0.1));
  const gain = calculateTdee(logs(0.1));
  assert.ok(loss.tdeeKcal! > 2200);
  assert.ok(gain.tdeeKcal! < 2200);
  assert.equal(loss.tdeeKcal, loss.averageIntakeKcal! - loss.weightChangeLbsPerDay! * 3500);
});

test('non-adherent intake and weight cannot poison the estimate; gaps remain elapsed days', () => {
  const input = logs(-0.1);
  input[7] = { ...input[7], is_adherent: false, calories_kcal: 1000000, body_weight_lbs: 5000 };
  input[10] = { ...input[10], is_adherent: false, calories_kcal: NaN, body_weight_lbs: NaN };
  assert.deepEqual(calculateTdee(input), calculateTdee(input.filter((row) => row.is_adherent)));
  assert.equal(calculateTdee(input).adherentDays, 26);
  assert.equal(calculateTdee(input).coverage, 26 / 28);
});

test('insufficient, missing, duplicated, and outside-window observations are handled deterministically', () => {
  assert.equal(calculateTdee(logs().slice(0, 13)).status, 'insufficient-data');
  assert.equal(calculateTdee([]).tdeeKcal, null);
  assert.equal(calculateTdee(logs(), { asOfDate: '2026-10-01' }).adherentDays, 0);
  assert.equal(calculateTdee(logs(), { windowDays: 14 }).adherentDays, 14);
  assert.throws(() => calculateTdee([...logs(), logs()[0]]));
  const missing = logs().map((row) => ({ ...row, body_weight_lbs: null }));
  assert.equal(calculateTdee(missing).status, 'insufficient-data');
});

test('Brzycki matches the formula and declines unsupported or singular inputs', () => {
  assert.equal(estimateBrzyckiOneRepMax(100, 5), 112.5);
  assert.equal(estimateBrzyckiOneRepMax(100, 1), 100);
  for (const reps of [0, 13, 37, 1.5, NaN]) assert.equal(estimateBrzyckiOneRepMax(100, reps), null);
  assert.equal(estimateBrzyckiOneRepMax(null, 5), null);
  assert.equal(estimateBrzyckiOneRepMax(0, 5), null);
});

test('food logging scales portions and micros with correct units, leaving unknown nutrients absent', () => {
  const item: DailyMenuItem = {
    id: 'rice', diningHall: 'busch-dining-hall', date: '2026-09-08', meal: 'lunch', menuItemId: 1, foodId: 1,
    name: 'Rice', serving: { amount: 1, unit: 'cup', label: '1 cup' },
    macros: { caloriesKcal: 200, proteinG: 4, carbsG: 45, fatG: 0 },
    nutrients: { mg_sodium: 50, g_fiber: null, mg_vitamin_d: 0.01, iu_vitamin_a: 100 },
  };
  const result = foodLogAmounts(item, 1.5, { caloriesKcal: 200, proteinG: 4, carbsG: 45, fatG: 0 });
  assert.equal(result.macros.caloriesKcal, 300);
  assert.deepEqual(result.micros, { sodium_mg: 75, vitamin_d_mcg: 15 });
  assert.throws(() => foodLogAmounts(item, -1, result.macros));
});
