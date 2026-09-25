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

/**
 * Real photographs of real US labels (Open Food Facts, CC BY-SA), put through on-device text
 * recognition and kept in ML Kit's own result shape — lines, word boxes and corner points. The
 * expected values were read off each photograph by eye, not taken from any database: several
 * photos show an older label than the one a database now lists.
 */
import fixtures from './support/labelOcr.json';
import type { OcrResult } from '../quickActions/nutritionLabel';

const photo = (code: keyof typeof fixtures) => parseNutritionLabel(fixtures[code] as OcrResult);

test('real labels read whole where the photograph shows every macro', () => {
  const cases: [keyof typeof fixtures, string, number, number, number, number, string][] = [
    ['028400090858', "Lay's", 160, 2, 15, 10, '1 package'],
    ['016000275287', 'Cheerios, pre-2020 label', 100, 3, 20, 2, '1 cup (28g)'],
    ['030000010204', 'Quaker oats', 150, 5, 27, 3, '1/2 cup dry (40g)'],
    ['038000138416', 'Pringles, bilingual rows', 150, 1, 16, 9, '(1 oz/28g) (About 15 Crisps/Aprox. 15 Crujientes)'],
    ['070470003023', 'Yoplait, hand-held and tilted', 150, 6, 28, 2, '1 container'],
    ['049000000443', 'Coca-Cola, kJ and kcal', 250, 0, 63, 0, '591 ml. (20 oz)'],
  ];
  for (const [code, name, caloriesKcal, proteinG, carbsG, fatG, serving] of cases) {
    const reading = photo(code);
    assert.deepEqual(reading.macros, { caloriesKcal, proteinG, carbsG, fatG }, name);
    assert.equal(reading.complete, true, name);
    assert.equal(reading.servingLabel, serving, name);
  }
});

test('a two-column label reads the per-serving column, never the per-container one', () => {
  // OCR lost the soup's per-serving "6g" of protein. The "12g" per can beside it is the number a
  // flat reading used to log — twice the real figure, with nothing on screen to say so.
  const soup = photo('041196910759');
  assert.deepEqual(soup.macros, { caloriesKcal: 100, carbsG: 17, fatG: 1.5 });
  assert.deepEqual(missingMacros(soup), ['protein']);
  assert.equal(soup.micros.sodium_mg, 670, 'not the 1400mg per can');
  assert.equal(soup.servingLabel, '1 cup (249g)');
  const macaroni = photo('021000658831');
  assert.equal(macaroni.macros.caloriesKcal, 250, 'dry mix, not the 350 as prepared');
  assert.equal(macaroni.macros.carbsG, 49);
  assert.equal(macaroni.micros.cholesterol_mg, undefined, 'its 5mg was not read; the prepared 10mg must not stand in');
});

test('a lost decimal point is caught by the percentage printed beside it', () => {
  // The photo says "2.7mg 15%"; OCR read "27mg". 27mg of iron would be 150% of the Daily Value.
  assert.equal(photo('021000658831').micros.iron_mg, 2.7);
});

test('footnotes and glare leave a macro missing rather than wrong', () => {
  // Glare covers "Calories 160"; what remains is "Calories from Fat 60" and the footnote's
  // "Calories: 2,000 2,500". Neither is this cookie's calories.
  const oreo = photo('044000032029');
  assert.deepEqual(oreo.macros, { proteinG: 1, carbsG: 25, fatG: 7 });
  // Cheerios' footnote says "26g total carbohydrate (7g sugars)"; its panel says 20g.
  assert.equal(photo('016000275287').macros.carbsG, 20);
  // A crumpled wrapper: "Calories 230," is legible, the rest is not.
  assert.deepEqual(photo('040000424314').macros, { caloriesKcal: 230 });
});

test('a word is never read as a number', () => {
  const reading = parseNutritionLabel('Calories\n2,000 calories a day is used for general nutrition advice.\nProtein is 3g');
  assert.equal('caloriesKcal' in reading.macros, false, '"is" once read as 5 calories');
  assert.equal(reading.macros.proteinG, 3);
});
