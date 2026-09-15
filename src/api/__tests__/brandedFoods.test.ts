import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseBrandedFoods, toTsQuery } from '../brandedFoods';

test('the word still being typed matches as a prefix, and operators never reach tsquery', () => {
  // Without the trailing :* nothing is found until a brand is spelled out in full.
  assert.equal(toTsQuery('chipo'), 'chipo:*');
  assert.equal(toTsQuery('chipotle burrito'), 'chipotle & burrito:*');
  assert.equal(toTsQuery('  Shah\'s  Halal  '), 'shah & s & halal:*');
  // tsquery's own operators are exactly what a search box must not pass through.
  assert.equal(toTsQuery("bad' | 'x:*"), 'bad & x:*');
  assert.equal(toTsQuery('a & b !c'), 'a & b & c:*');
  assert.equal(toTsQuery('   '), null);
  assert.equal(toTsQuery('!!!'), null);
  // A pasted paragraph is bounded rather than turned into a sixty-clause query.
  assert.equal(toTsQuery('one two three four five six seven eight')!.split(' & ').length, 6);
});

test('a brand that published only some of its macros publishes nothing usable', () => {
  const row = { id: 'a1', brand_name: 'Chipotle', item_name: 'Chicken burrito bowl',
    serving_size_grams: 510, calories: 625, protein: 45, carbs: 63, fat: 21.5 };
  const [parsed] = parseBrandedFoods([row]);
  assert.equal(parsed.name, 'Chicken burrito bowl');
  assert.equal(parsed.brand, 'Chipotle');
  assert.equal(parsed.key, 'branded:a1');
  assert.equal(parsed.quality, 'brand');
  assert.deepEqual(parsed.macros, { caloriesKcal: 625, proteinG: 45, carbsG: 63, fatG: 21.5 });
  assert.equal(parsed.servingLabel, '510 g serving');
  assert.deepEqual(parsed.micros, {}, 'a brand publishes macros; micronutrients stay unreported');

  // A missing macro drops the row rather than reading as a food with none of that macro.
  assert.equal(parseBrandedFoods([{ ...row, carbs: null }]).length, 0);
  assert.equal(parseBrandedFoods([{ ...row, protein: 'lots' }]).length, 0);
  assert.equal(parseBrandedFoods([{ ...row, calories: -5 }]).length, 0);
  // A missing gram weight is different: the serving is still a serving.
  assert.equal(parseBrandedFoods([{ ...row, serving_size_grams: null }])[0].servingLabel, 'serving');
  assert.equal(parseBrandedFoods([{ ...row, brand_name: '  ' }]).length, 0);
  assert.deepEqual(parseBrandedFoods(null), []);
  assert.deepEqual(parseBrandedFoods([{ id: 'x' }]), []);
});
