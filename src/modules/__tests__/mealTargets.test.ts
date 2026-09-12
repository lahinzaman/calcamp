import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_SPLIT_ID, SPLIT_PRESETS, mealTargets, splitById } from '../nutrition/mealTargets';
import { MEAL_SLOTS } from '../../types/foodEntry';
import type { MacroTotals } from '../../types/nutrition';

const daily: MacroTotals = { caloriesKcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 };

test('every preset covers each meal slot and adds up to the whole day', () => {
  assert.ok(SPLIT_PRESETS.length >= 4);
  assert.equal(new Set(SPLIT_PRESETS.map(preset => preset.id)).size, SPLIT_PRESETS.length);
  for (const preset of SPLIT_PRESETS) {
    assert.deepEqual(Object.keys(preset.split).sort(), [...MEAL_SLOTS].sort(), preset.id);
    assert.equal(Object.values(preset.split).reduce((sum, share) => sum + share, 0), 100, preset.id);
    assert.ok(preset.hint.length > 10, preset.id);
  }
  assert.equal(splitById(DEFAULT_SPLIT_ID).id, DEFAULT_SPLIT_ID);
  assert.equal(splitById('nonsense').id, SPLIT_PRESETS[0].id, 'an unknown id falls back rather than throwing');
});

test('a split divides the whole day and nothing is lost in the rounding', () => {
  const targets = mealTargets(daily, splitById('classic').split);
  assert.equal(Math.round(targets.breakfast!.caloriesKcal), 500);
  assert.equal(Math.round(targets.dinner!.caloriesKcal), 700);
  const total = MEAL_SLOTS.reduce((sum, slot) => sum + (targets[slot]?.caloriesKcal ?? 0), 0);
  assert.ok(Math.abs(total - daily.caloriesKcal) < 1e-9);
  // Macros are split on the same shares, not recomputed from calories.
  assert.equal(Math.round(targets.lunch!.proteinG), 45);
});

test('a meal with no share gets no target, rather than a zero one to fail against', () => {
  const targets = mealTargets(daily, splitById('two-meals').split);
  assert.equal('breakfast' in targets, false);
  assert.ok(targets.lunch!.caloriesKcal > 0);
});

test('with no daily target there is nothing to divide', () => {
  assert.deepEqual(mealTargets(null, splitById('classic').split), {});
  assert.deepEqual(mealTargets(daily, { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }), {});
});
