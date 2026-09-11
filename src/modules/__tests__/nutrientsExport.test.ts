import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nutrientStatuses, DAILY_VALUES } from '../nutrition/dailyValues';
import { daysCsv, entriesCsv, toCsv } from '../settings/csv';

test('unreported nutrients are separated from zero, and limits are distinguished from goals', () => {
  const { tracked, unreported } = nutrientStatuses({ vitamin_c_mg: 45, sodium_mg: 3000, iron_mg: 0 });
  assert.equal(tracked.length, 3);
  assert.equal(unreported.length, Object.keys(DAILY_VALUES).length - 3);
  const vitaminC = tracked.find(status => status.key === 'vitamin_c_mg')!;
  assert.equal(vitaminC.ratio, 0.5);
  assert.equal(vitaminC.kind, 'goal');
  assert.equal(vitaminC.group, 'vitamin');
  const sodium = tracked.find(status => status.key === 'sodium_mg')!;
  assert.equal(sodium.kind, 'limit');
  assert.ok(sodium.ratio > 1);
  // A reported zero is tracked at 0%, not treated as missing.
  assert.equal(tracked.find(status => status.key === 'iron_mg')!.ratio, 0);
});

test('CSV quoting survives commas and quotes in food names', () => {
  assert.equal(toCsv([['a,b', 'say "hi"', null, 3]]), '"a,b","say ""hi""","","3"');
  const days = daysCsv([{ log_date: '2026-09-10', calories_kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60, body_weight_lbs: 180, is_adherent: true }]);
  assert.ok(days.startsWith('"date","calories_kcal"'));
  assert.ok(days.includes('"2026-09-10"'));
  assert.ok(days.includes('"yes"'));
  const entries = entriesCsv([{ id: '1', date: '2026-09-10', meal: 'lunch', name: 'Rice, fried', servings: 2, servingLabel: '1 cup',
    macros: { caloriesKcal: 400, proteinG: 8, carbsG: 70, fatG: 9 }, micros: {}, referenceMacros: { caloriesKcal: 200, proteinG: 4, carbsG: 35, fatG: 4.5 },
    referenceMicros: {}, source: 'dining', loggedAtMs: 0 }]);
  assert.ok(entries.includes('"Rice, fried"'));
  assert.ok(entries.includes('"lunch"'));
});
