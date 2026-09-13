import assert from 'node:assert/strict';
import { test } from 'node:test';

import { missingMacros, parseNutritionLabel, servingFrom } from '../quickActions/nutritionLabel';

const panel = `Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Amount per serving
Calories 230
% Daily Value*
Total Fat 8g 10%
Saturated Fat 1g 5%
Trans Fat 0g
Cholesterol 0mg 0%
Sodium 160mg 7%
Total Carbohydrate 37g 13%
Dietary Fiber 4g 14%
Total Sugars 12g
Includes 10g Added Sugars 20%
Protein 3g
Vitamin D 2mcg 10%
Calcium 260mg 20%
Iron 8mg 45%
Potassium 235mg 6%`;

test('a clean panel reads as one serving with all four macros', () => {
  const reading = parseNutritionLabel(panel);
  assert.equal(reading.complete, true);
  assert.deepEqual(reading.macros, { caloriesKcal: 230, fatG: 8, carbsG: 37, proteinG: 3 });
  assert.equal(reading.servingLabel, '2/3 cup (55g)');
  assert.deepEqual(missingMacros(reading), []);
});

test('the more specific line wins over the one that contains it', () => {
  const reading = parseNutritionLabel(panel);
  // "Total Fat 8g" must not be read as saturated, and added sugars must not be read as total.
  assert.equal(reading.macros.fatG, 8);
  assert.equal(reading.micros.saturated_fat_g, 1);
  assert.equal(reading.micros.sugar_g, 12);
  assert.equal(reading.micros.added_sugar_g, 10);
  assert.equal(reading.micros.fiber_g, 4);
  assert.equal(reading.micros.sodium_mg, 160);
});

test('a genuine zero is kept and an absent nutrient stays absent', () => {
  const reading = parseNutritionLabel(panel);
  assert.equal(reading.micros.trans_fat_g, 0);
  assert.equal(reading.micros.cholesterol_mg, 0);
  assert.equal('magnesium_mg' in reading.micros, false);
});

test('the characters OCR confuses inside numbers are repaired', () => {
  const reading = parseNutritionLabel('Calories 23O\nTotal Fat 8g\nTotal Carbohydrate l2g\nProtein 3g\nSodium 16O mg');
  assert.equal(reading.macros.caloriesKcal, 230);
  assert.equal(reading.macros.carbsG, 12);
  assert.equal(reading.micros.sodium_mg, 160);
});

test('a half-read panel says which macros are missing instead of inventing them', () => {
  const reading = parseNutritionLabel('Nutrition Facts\nCalories 230\nProtein 3g');
  assert.equal(reading.complete, false);
  assert.deepEqual(missingMacros(reading).sort(), ['carbs', 'fat']);
  assert.equal('carbsG' in reading.macros, false);
});

test('nothing resembling a label produces nothing at all', () => {
  const reading = parseNutritionLabel('a photograph of a cat');
  assert.deepEqual(reading.macros, {});
  assert.deepEqual(reading.micros, {});
  assert.equal(reading.servingLabel, null);
  assert.equal(reading.complete, false);
  assert.equal(servingFrom('no serving here'), null);
});

test('an absurd reading is refused rather than logged', () => {
  const reading = parseNutritionLabel('Calories 999999\nProtein 3g\nTotal Fat 8g\nTotal Carbohydrate 37g');
  assert.equal('caloriesKcal' in reading.macros, false, 'a misread digit run cannot become a real entry');
  assert.equal(reading.complete, false);
});
