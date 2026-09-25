import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { BarcodeUnknown, lookupBarcode, parseUsdaBranded } from '../quickActions/barcode';
import { pickMealPictureSize } from '../quickActions/pictureSize';

/**
 * The lookup this replaced asked FatSecret, whose barcode method is a paid Premier feature the
 * project's key does not have: every scan, and every code typed by hand, failed. These pin the
 * replacement's order and its honesty about the difference between "not listed" and "unreachable".
 */
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const LAYS = { status: 1, product: { product_name: 'Classic Potato Chips', brands: "Lay's", serving_size: '1 oz (28 g)', serving_quantity: 28,
  nutriments: { 'energy-kcal_100g': 536, proteins_100g: 7, carbohydrates_100g: 54, fat_100g: 36,
    'energy-kcal_serving': 160, proteins_serving: 2, carbohydrates_serving: 15, fat_serving: 10 } } };
const USDA_BAR = { foods: [
  { gtinUpc: '999999999993', description: 'SOMETHING ELSE', foodNutrients: [] },
  { gtinUpc: '040000503781', description: 'SNICKERS MINIS', brandOwner: 'Mars', servingSize: 17, servingSizeUnit: 'g',
    householdServingFullText: '2 pieces', foodNutrients: [
      { nutrientNumber: '208', value: 471 }, { nutrientNumber: '203', value: 5.88 },
      { nutrientNumber: '205', value: 58.8 }, { nutrientNumber: '204', value: 23.5 }] }] };

function serve(routes: { off?: [number, unknown] | 'down'; usda?: [number, unknown] | 'down' }) {
  const asked: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input); asked.push(url);
    const route = url.includes('openfoodfacts') ? routes.off : routes.usda;
    if (!route || route === 'down') throw new TypeError('Network request failed');
    return Response.json(route[1], { status: route[0] });
  };
  return asked;
}

test('a US UPC is looked up as GTIN-13 in Open Food Facts, with no sign-in', async () => {
  const asked = serve({ off: [200, LAYS] });
  const food = await lookupBarcode('0 28400 09085 8', new AbortController().signal);
  assert.match(asked[0], /openfoodfacts\.org\/api\/v2\/product\/0028400090858\.json/);
  assert.equal(asked.length, 1, 'USDA is not asked when the first answer is complete');
  assert.equal(food.brand, "Lay's");
  assert.equal(food.servings[food.selected].description, '1 oz (28 g)');
  assert.deepEqual(food.servings[food.selected].macros, { caloriesKcal: 160, proteinG: 2, carbsG: 15, fatG: 10 });
});

test('a product Open Food Facts lacks is found in USDA by its exact UPC', async () => {
  const asked = serve({ off: [404, { status: 0 }], usda: [200, USDA_BAR] });
  const food = await lookupBarcode('040000503781', new AbortController().signal);
  assert.match(asked[1], /api\.nal\.usda\.gov.*dataType=Branded.*query=040000503781/);
  assert.equal(food.name, 'SNICKERS MINIS');
  assert.equal(food.servings[0].description, '2 pieces (17 g)');
  assert.equal(food.servings[0].macros.caloriesKcal, 80.1, 'per-100 g figures scaled to the 17 g serving');
  assert.equal(parseUsdaBranded(USDA_BAR, '0999999999994'), null, 'a record for other digits is never taken');
});

test('"not listed anywhere" and "could not ask" are different answers', async () => {
  serve({ off: [404, { status: 0 }], usda: [200, { foods: [] }] });
  await assert.rejects(lookupBarcode('040000503781', new AbortController().signal), (error: unknown) => error instanceof BarcodeUnknown);
  serve({ off: 'down', usda: 'down' });
  await assert.rejects(lookupBarcode('040000503781', new AbortController().signal),
    (error: unknown) => !(error instanceof BarcodeUnknown) && /Check your connection/.test((error as Error).message));
});

test('a code whose check digit is wrong is refused before anything is asked', async () => {
  const asked = serve({ off: [200, LAYS] });
  await assert.rejects(lookupBarcode('028400090859', new AbortController().signal), /did not read as a food barcode/);
  assert.equal(asked.length, 0);
});

test('meal photos are taken near 2,000 pixels, not at full sensor size', () => {
  assert.equal(pickMealPictureSize(['3840x2160', '1920x1080', '1280x720', '640x480', 'Photo', 'High']), '1920x1080');
  assert.equal(pickMealPictureSize(['4032x3024', '2048x1536', '1600x1200']), '2048x1536');
  assert.equal(pickMealPictureSize(['Photo', 'High', 'Medium']), 'High');
  assert.equal(pickMealPictureSize(['4032x3024']), null, 'nothing smaller: leave the camera on its default');
});
