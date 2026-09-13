import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BUNDLED_FOOD_COUNT, searchBundledFoods, toSearchResult } from '../../data/usdaFoods';
import { NUTRIENT_UNITS, type NutrientKey } from '../../types/nutrition';

test('the bundled catalogue is large, and every row it returns is complete', () => {
  assert.ok(BUNDLED_FOOD_COUNT > 7000, `only ${BUNDLED_FOOD_COUNT} foods bundled`);
  for (const term of ['apple', 'chicken breast', 'yogurt', 'rice', 'almond', 'potato chips', 'cheddar']) {
    const results = searchBundledFoods(term);
    assert.ok(results.length, `no results for ${term}`);
    for (const food of results) {
      assert.ok(food.name.trim().length > 2, term);
      for (const macro of ['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const) {
        assert.ok(Number.isFinite(food.macros[macro]) && food.macros[macro] >= 0, `${food.name}.${macro}`);
      }
      assert.ok(food.servingGrams > 0);
      for (const key of Object.keys(food.micros)) {
        assert.ok(key in NUTRIENT_UNITS, `${food.name} reports unknown nutrient ${key}`);
        assert.ok(food.micros[key as NutrientKey]! >= 0, `${food.name}.${key}`);
      }
    }
  }
});

test('the fruit, snack and restaurant items people search for are in there', () => {
  const found = (term: string) => searchBundledFoods(term, 40).some(food => food.name.toLowerCase().includes(term.split(' ')[0]));
  for (const term of ['banana', 'strawberr', 'blueberr', 'avocado', 'broccoli', 'salmon', 'oatmeal',
    'peanut butter', 'pretzel', 'popcorn', 'tortilla', 'hummus', 'cheerios', 'quaker',
    'kraft', 'pillsbury', 'campbell', 'mcdonald', 'pizza hut', 'subway']) {
    assert.ok(found(term), `nothing matched ${term}`);
  }
});

test('a packaged brand the reference tables never covered is left to the live API', () => {
  // Foundation and SR Legacy carry named products, but not the 400,000-item Branded set —
  // so a miss here has to stay a miss rather than being answered with something similar.
  assert.deepEqual(searchBundledFoods('doritos'), []);
});

test('every word must match, so two words narrow rather than widen', () => {
  const both = searchBundledFoods('greek yogurt', 50);
  assert.ok(both.length);
  for (const food of both) {
    const text = `${food.name} ${food.category}`.toLowerCase();
    assert.ok(text.includes('greek') && text.includes('yogurt'), food.name);
  }
  assert.ok(both.length < searchBundledFoods('yogurt', 500).length);
  assert.deepEqual(searchBundledFoods(''), []);
  assert.deepEqual(searchBundledFoods('   '), []);
  assert.deepEqual(searchBundledFoods('zzzzqqq'), []);
});

test('a household portion is the serving, and its values are scaled to it', () => {
  const withPortion = searchBundledFoods('banana', 30).find(food => food.servingGrams !== 100);
  assert.ok(withPortion, 'expected at least one food measured in something other than 100 g');
  assert.match(withPortion!.servingLabel, /\(\d+ g\)$/);
  // The dataset is per 100 g; a 118 g banana must not report the per-100 g figure.
  const perGram = withPortion!.macros.caloriesKcal / withPortion!.servingGrams;
  assert.ok(perGram > 0 && perGram < 10, 'calories per gram is implausible');
});

test('a food with no household portion falls back to a stated 100 g', () => {
  const plain = searchBundledFoods('oil', 40).find(food => food.servingGrams === 100);
  if (plain) assert.equal(plain.servingLabel, '3.53 oz (100 g)');
});

test('search results convert into the shape the food list already speaks', () => {
  const [food] = searchBundledFoods('apple');
  const result = toSearchResult(food);
  assert.equal(result.key, food.key);
  assert.equal(result.servingLabel, food.servingLabel);
  assert.ok(result.quality === 'lab' || result.quality === 'reference');
  assert.deepEqual(result.macros, food.macros);
});

test('a search term with regex characters is matched literally, not compiled', () => {
  assert.doesNotThrow(() => searchBundledFoods('chicken (raw)'));
  assert.doesNotThrow(() => searchBundledFoods('a+b*c['));
});
