import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PERFECT_WINDOW_KCAL, addDays, dayStatus, perfectDays, weekDates } from '../diary/logCalendar';
import { DRINKS, alcoholGrams, drinkMacros, drinkNote, drinksInCategory, searchDrinks, standardDrinks } from '../../data/alcohol';

test('a day is marked only when there is both a log and a target to judge it against', () => {
  assert.equal(dayStatus(2000, 2000).mark, 'perfect');
  assert.equal(dayStatus(2000 + PERFECT_WINDOW_KCAL, 2000).mark, 'perfect');
  assert.equal(dayStatus(2000 - PERFECT_WINDOW_KCAL, 2000).mark, 'perfect');
  assert.equal(dayStatus(2101, 2000).mark, 'over');
  assert.equal(dayStatus(1899, 2000).mark, 'under');
  // No target is not a failed day, and neither is a day you did not log.
  assert.equal(dayStatus(2400, null).mark, 'logged');
  assert.equal(dayStatus(null, 2000).mark, 'none');
  assert.equal(dayStatus(0, 2000).mark, 'none');
  assert.equal(dayStatus(undefined, 2000).mark, 'none');
  assert.equal(dayStatus(2000, 2000).glyph, '✓');
});

test('the week strip runs Monday to Sunday around the given day', () => {
  const week = weekDates('2026-09-11');
  assert.equal(week.length, 7);
  assert.equal(week[0], '2026-09-07');
  assert.equal(week[6], '2026-09-13');
  assert.ok(week.includes('2026-09-11'));
  assert.equal(weekDates('2026-09-11', -1)[0], '2026-08-31');
  // A Sunday belongs to the week that started the Monday before it, not the one after.
  assert.equal(weekDates('2026-09-13')[0], '2026-09-07');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

test('perfect days count only against days that were actually logged', () => {
  const days = [{ log_date: '2026-09-01', calories_kcal: 2000 }, { log_date: '2026-09-02', calories_kcal: 2600 },
    { log_date: '2026-09-03', calories_kcal: null }, { log_date: '2026-09-04', calories_kcal: 1950 }];
  assert.deepEqual(perfectDays(days, 2000), { hit: 2, logged: 3 });
  assert.deepEqual(perfectDays(days, null), { hit: 0, logged: 3 });
});

test('drink energy comes from the alcohol, and every entry carries a real ABV and serving', () => {
  assert.ok(DRINKS.length > 200);
  assert.equal(new Set(DRINKS.map(drink => drink.name)).size, DRINKS.length);
  for (const drink of DRINKS) {
    assert.ok(drink.abv >= 0 && drink.abv <= 96, drink.name);
    assert.ok(drink.servingMl > 0, drink.name);
    assert.ok(drink.carbsG === null || drink.carbsG >= 0, drink.name);
    assert.ok(drinkMacros(drink).caloriesKcal >= 0, drink.name);
  }
  // A 1.5 fl oz shot of 40% spirit is 14 g of ethanol: one standard drink, about 98 kcal.
  const vodka = DRINKS.find(drink => drink.name.startsWith("Tito's"))!;
  assert.equal(vodka.carbsG, 0);
  assert.ok(Math.abs(alcoholGrams(vodka) - 14) < 0.2);
  assert.ok(Math.abs(standardDrinks(vodka) - 1) < 0.02);
  assert.equal(drinkMacros(vodka).caloriesKcal, 98);
  // A 12 oz 4.2% light beer with 6.6 g of carbohydrate lands on its published 110 kcal.
  const light = DRINKS.find(drink => drink.name.startsWith('Bud Light beer'))!;
  assert.ok(Math.abs(drinkMacros(light).caloriesKcal - 110) <= 2);
});

test('the drinks catalogue says which part of a number is calculated and which is missing', () => {
  const vodka = DRINKS.find(drink => drink.carbsG === 0)!;
  assert.match(drinkNote(vodka), /no carbohydrate/);
  const unknown = DRINKS.find(drink => drink.carbsG === null);
  if (unknown) assert.match(drinkNote(unknown), /underestimate/);
  const sugary = DRINKS.find(drink => (drink.carbsG ?? 0) > 5)!;
  assert.match(drinkNote(sugary), /Check the label/);
});

test('drinks are searchable by brand, category and name', () => {
  assert.ok(searchDrinks('bud light').some(drink => drink.name.startsWith('Bud Light')));
  assert.ok(searchDrinks('tequila').every(drink => `${drink.name} ${drink.category}`.toLowerCase().includes('tequila')));
  assert.deepEqual(searchDrinks(''), []);
  assert.deepEqual(searchDrinks('zzzzz'), []);
  assert.ok(drinksInCategory('beer').length > 40);
  assert.ok(drinksInCategory('wine').length > 15);
});
