import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseNutrisliceWeek, stationName } from '../../api/nutrislice';
import { EMPTY_FILTERS, filterMenu, groupByStation, proteinDensity, stationsOf } from '../dining/menuFilters';
import type { DailyMenuItem } from '../../types/nutrislice';

const dish = (over: Partial<DailyMenuItem> & { name: string }): DailyMenuItem => ({
  id: over.name, diningHall: 'busch-dining-hall', date: '2026-09-11', meal: 'lunch', station: 'ENTREES',
  menuItemId: 1, foodId: 1, serving: { amount: 1, unit: 'cup', label: '1 cup' },
  macros: { caloriesKcal: 300, proteinG: 25, carbsG: 20, fatG: 10 }, nutrients: {}, ...over,
});

test('station headers name the dishes that follow them, and are not dishes themselves', () => {
  const week = parseNutrisliceWeek({ days: [{ date: '2026-09-11', menu_items: [
    { id: 1, food: null, is_section_title: true, is_station_header: true, text: 'SOUPS' },
    { id: 2, food: { id: 10, name: 'Miso broth' } },
    { id: 3, food: null, is_station_header: true, text: '  SALAD BAR  ' },
    { id: 4, food: { id: 11, name: 'Chickpeas' } },
  ] }] });
  const items = week.days[0].menu_items;
  assert.equal(stationName(items[0]), 'SOUPS');
  assert.equal(stationName(items[2]), 'SALAD BAR');
  // A row with a food is never a station, whatever text it happens to carry.
  assert.equal(stationName(items[1]), null);
  assert.equal(stationName({ id: 5, food: null, is_station_header: true, text: '   ' }), null);
});

test('grouping keeps the order the hall published, not alphabetical order', () => {
  const menu = [dish({ name: 'Broth', station: 'SOUPS' }), dish({ name: 'Chicken', station: 'ENTREES' }),
    dish({ name: 'Bisque', station: 'SOUPS' }), dish({ name: 'Loose fruit', station: null })];
  assert.deepEqual(groupByStation(menu).map(group => group.station), ['SOUPS', 'ENTREES', 'Everything else']);
  assert.deepEqual(groupByStation(menu)[0].items.map(item => item.name), ['Broth', 'Bisque']);
  assert.deepEqual(stationsOf(menu), ['SOUPS', 'ENTREES']);
});

test('search needs every word and station chips narrow the list', () => {
  const menu = [dish({ name: 'Grilled chicken breast' }), dish({ name: 'Grilled tofu', station: 'CANTINA' }), dish({ name: 'Chicken soup', station: 'SOUPS' })];
  assert.deepEqual(filterMenu(menu, { ...EMPTY_FILTERS, query: 'grilled chicken' }, null).map(item => item.name), ['Grilled chicken breast']);
  // The station name is searchable too, so typing where you are standing works.
  assert.deepEqual(filterMenu(menu, { ...EMPTY_FILTERS, query: 'cantina' }, null).map(item => item.name), ['Grilled tofu']);
  assert.equal(filterMenu(menu, { ...EMPTY_FILTERS, stations: ['SOUPS', 'CANTINA'] }, null).length, 2);
});

test('a dish with an unpublished value is left out of a filter rather than counted as zero', () => {
  const unknown = dish({ name: 'Mystery stew', macros: { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null } });
  const known = dish({ name: 'Chicken', macros: { caloriesKcal: 200, proteinG: 30, carbsG: 5, fatG: 6 } });
  const menu = [unknown, known];
  for (const quick of ['high-protein', 'light', 'low-carb', 'fits'] as const) {
    assert.deepEqual(filterMenu(menu, { ...EMPTY_FILTERS, quick: [quick] }, 500).map(item => item.name), ['Chicken'], quick);
  }
  // Fibre and sodium live in the nutrient bag, and absent there means absent too.
  assert.deepEqual(filterMenu(menu, { ...EMPTY_FILTERS, quick: ['high-fiber'] }, null), []);
  assert.equal(filterMenu([dish({ name: 'Beans', nutrients: { g_fiber: 8 } })], { ...EMPTY_FILTERS, quick: ['high-fiber'] }, null).length, 1);
});

test('"fits today" needs a remaining budget to mean anything', () => {
  const menu = [dish({ name: 'Small', macros: { caloriesKcal: 150, proteinG: 5, carbsG: 5, fatG: 5 } }), dish({ name: 'Big' })];
  assert.deepEqual(filterMenu(menu, { ...EMPTY_FILTERS, quick: ['fits'] }, 200).map(item => item.name), ['Small']);
  assert.deepEqual(filterMenu(menu, { ...EMPTY_FILTERS, quick: ['fits'] }, null), []);
});

test('protein density ranks per calorie, and unknowns sort last rather than first', () => {
  assert.equal(proteinDensity(dish({ name: 'x', macros: { caloriesKcal: 200, proteinG: 30, carbsG: 0, fatG: 0 } })), 15);
  assert.equal(proteinDensity(dish({ name: 'x', macros: { caloriesKcal: 0, proteinG: 30, carbsG: 0, fatG: 0 } })), null);
  const menu = [dish({ name: 'Unknown', macros: { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null } }),
    dish({ name: 'Lean', macros: { caloriesKcal: 120, proteinG: 24, carbsG: 1, fatG: 2 } }),
    dish({ name: 'Rich', macros: { caloriesKcal: 400, proteinG: 12, carbsG: 40, fatG: 20 } })];
  assert.deepEqual(filterMenu(menu, { ...EMPTY_FILTERS, sort: 'protein-density' }, null).map(item => item.name), ['Lean', 'Rich', 'Unknown']);
  assert.deepEqual(filterMenu(menu, { ...EMPTY_FILTERS, sort: 'calories-low' }, null).map(item => item.name), ['Lean', 'Rich', 'Unknown']);
});
