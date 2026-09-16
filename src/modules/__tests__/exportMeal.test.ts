import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toHealthMeal } from '../health/exportMeal';
import { validateHealthMeal } from '../health/types';
import type { FoodEntry } from '../../types/foodEntry';

const entry = {
  id: 'e1', date: '2026-09-15', meal: 'lunch', name: 'Chicken burrito bowl', servings: 1.5,
  servingLabel: '1 bowl', loggedAtMs: Date.parse('2026-09-15T12:30:00Z'), source: 'photo',
  macros: { caloriesKcal: 937.5, proteinG: 67.5, carbsG: 94.5, fatG: 32.25 },
  referenceMacros: { caloriesKcal: 625, proteinG: 45, carbsG: 63, fatG: 21.5 },
  micros: {}, referenceMicros: {},
} as unknown as FoodEntry;

test('a logged meal exports the portion actually eaten, macros and all', () => {
  const meal = toHealthMeal(entry, Date.parse('2026-09-15T12:31:00Z'));
  // entry.macros is already the portion eaten; scaling it again would export a meal nobody ate.
  assert.equal(meal.caloriesKcal, 937.5);
  assert.equal(meal.proteinG, 67.5);
  assert.equal(meal.carbsG, 94.5);
  assert.equal(meal.fatG, 32.25);
  assert.equal(meal.name, 'Chicken burrito bowl');
  assert.equal(meal.date, '2026-09-15T12:30:00.000Z');
  validateHealthMeal(meal);
});

test('an edited meal replaces the sample it already wrote rather than adding a second', () => {
  // HealthKit replaces a sample carrying a known HKSyncIdentifier only when the version is
  // higher. A fixed version made an edit a duplicate it silently ignored.
  const first = toHealthMeal(entry, Date.parse('2026-09-15T12:31:00Z'));
  const edited = toHealthMeal({ ...entry, servings: 2, macros: { caloriesKcal: 1250, proteinG: 90, carbsG: 126, fatG: 43 } } as FoodEntry,
    Date.parse('2026-09-15T13:00:00Z'));
  assert.equal(first.id, edited.id, 'the same meal, so the same sync identifier');
  assert.ok(edited.version! > first.version!, `${edited.version} did not supersede ${first.version}`);
  assert.equal(edited.caloriesKcal, 1250);
});
