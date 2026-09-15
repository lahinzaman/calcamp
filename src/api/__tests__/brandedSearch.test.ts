import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseBrandedSearch } from '../brandedSearch';

const item = { key: 'fatsecret:1', brandName: 'Chipotle', itemName: 'Chicken Burrito Bowl',
  servingLabel: '1 serving', macros: { caloriesKcal: 625, proteinG: 45, carbsG: 63, fatG: 21.5 }, foodId: '1' };

test('a branded hit keeps its brand apart from its item, and an incomplete one is dropped', () => {
  const [parsed] = parseBrandedSearch({ items: [item] });
  assert.equal(parsed.name, 'Chicken Burrito Bowl');
  assert.equal(parsed.brand, 'Chipotle');
  assert.equal(parsed.key, 'fatsecret:1');
  assert.equal(parsed.quality, 'brand');
  assert.equal(parsed.servingLabel, '1 serving');
  assert.deepEqual(parsed.macros, { caloriesKcal: 625, proteinG: 45, carbsG: 63, fatG: 21.5 });
  assert.deepEqual(parsed.micros, {}, 'a brand publishes macros; micronutrients stay unreported');

  // A missing macro drops the row rather than reading as a bowl with no protein in it.
  assert.equal(parseBrandedSearch({ items: [{ ...item, macros: { ...item.macros, proteinG: undefined } }] }).length, 0);
  assert.equal(parseBrandedSearch({ items: [{ ...item, macros: { ...item.macros, fatG: -1 } }] }).length, 0);
  assert.equal(parseBrandedSearch({ items: [{ ...item, brandName: '  ' }] }).length, 0);
  // A serving the backend could not name still logs, against a serving rather than a fiction.
  assert.equal(parseBrandedSearch({ items: [{ ...item, servingLabel: '' }] })[0].servingLabel, 'serving');
  assert.deepEqual(parseBrandedSearch({}), []);
  assert.deepEqual(parseBrandedSearch(null), []);
});
