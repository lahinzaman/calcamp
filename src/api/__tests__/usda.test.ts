import assert from 'node:assert/strict';
import { test } from 'node:test';

import { QUALITY_LABELS, parseUsdaFoods } from '../usda';

const nutrient = (nutrientNumber: string, value: number) => ({ nutrientNumber, value });
const chicken = {
  fdcId: 2759004, description: '  Chicken breast, raw  ', dataType: 'Foundation',
  foodNutrients: [
    nutrient('208', 165), nutrient('203', 31), nutrient('205', 0), nutrient('204', 3.6),
    nutrient('307', 74), nutrient('418', 0.34), nutrient('313', 400), nutrient('291', 0),
    nutrient('999', 12),
  ],
};

test('a USDA food keeps its macros and every nutrient the app can store', () => {
  const [food] = parseUsdaFoods({ foods: [chicken] });
  assert.equal(food.name, 'Chicken breast, raw');
  assert.equal(food.key, 'usda:2759004');
  assert.deepEqual(food.macros, { caloriesKcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 });
  assert.equal(food.micros.sodium_mg, 74);
  assert.equal(food.micros.vitamin_b12_mcg, 0.34);
  // A genuine zero is a measurement and is kept; an unknown nutrient is simply absent.
  assert.equal(food.micros.fiber_g, 0);
  assert.equal('vitamin_c_mg' in food.micros, false);
  assert.equal(food.servingLabel, '3.53 oz (100 g)');
});

test('fluoride is converted from the micrograms USDA reports into the milligrams we store', () => {
  const [food] = parseUsdaFoods({ foods: [chicken] });
  assert.equal(food.micros.fluoride_mg, 0.4);
});

test('data type becomes a quality signal rather than being dropped', () => {
  const of = (dataType: string) => parseUsdaFoods({ foods: [{ ...chicken, dataType }] })[0].quality;
  assert.equal(of('Foundation'), 'lab');
  assert.equal(of('SR Legacy'), 'reference');
  assert.equal(of('Branded'), 'brand');
  for (const label of Object.values(QUALITY_LABELS)) assert.ok(label.length > 5);
});

test('a food missing any macro is unusable rather than partly zero', () => {
  const partial = { ...chicken, foodNutrients: [nutrient('208', 165), nutrient('203', 31)] };
  assert.deepEqual(parseUsdaFoods({ foods: [partial] }), []);
  assert.deepEqual(parseUsdaFoods({ foods: [{ ...chicken, description: '   ' }] }), []);
  assert.deepEqual(parseUsdaFoods({}), []);
  assert.deepEqual(parseUsdaFoods(null), []);
});

test('negative and non-numeric readings are refused, not coerced', () => {
  const bad = { ...chicken, foodNutrients: [...chicken.foodNutrients, { nutrientNumber: '306', value: -5 },
    { nutrientNumber: '301', value: 'lots' as unknown as number }] };
  const [food] = parseUsdaFoods({ foods: [bad] });
  assert.equal('potassium_mg' in food.micros, false);
  assert.equal('calcium_mg' in food.micros, false);
});
