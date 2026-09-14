import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { fetchDailyMenu } from '../nutrislice';
import { foodLogAmounts } from '../../modules/dining/logFood';

/** A faithful slice of a real Rutgers week: a station header, a food with full nutrition,
 *  one the hall reports nothing for, and one whose zero carbohydrate is the truth. */
const week = JSON.parse(readFileSync(new URL('./fixtures/nutrisliceWeek.json', import.meta.url), 'utf8'));

const withMenu = async (payload: unknown) => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } })) as typeof fetch;
  try { return await fetchDailyMenu('busch-dining-hall', week.days[0].date, {}); }
  finally { globalThis.fetch = original; }
};

test('every macro the hall publishes survives the parse, and the ones it omits stay unknown', async () => {
  const items = await withMenu(week);
  const byName = new Map(items.map(item => [item.name, item]));

  // Published values arrive intact — not rounded away, not defaulted.
  const bagels = byName.get('ASSORTED BAGELS')!;
  assert.deepEqual(bagels.macros, { caloriesKcal: 353, proteinG: 12, carbsG: 70, fatG: 2.1 });
  assert.equal(bagels.station, 'BAGELS', 'the station header names the foods under it');

  // A hall that reports nothing leaves every macro unknown. Any of these becoming 0 is the
  // regression this test exists for: it would read as a food with no carbohydrate in it.
  const unreported = byName.get('FRESH FRUIT TO GO')!;
  assert.deepEqual(unreported.macros, { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null });

  // And a real zero is kept as a number, because chicken genuinely has no carbohydrate.
  const chicken = byName.get('COOKED CHICKEN STRIPS')!;
  assert.equal(chicken.macros.carbsG, 0);
  assert.notEqual(chicken.macros.carbsG, null, 'a measured zero is not the same as unreported');
  assert.equal(chicken.macros.proteinG, 18);

  // A header carries no food of its own and never becomes a loggable row.
  assert.equal(items.some(item => item.name === 'BAGELS'), false);
});

test('logging a dining item carries its carbohydrate into the diary unchanged', async () => {
  const items = await withMenu(week);
  const bagels = items.find(item => item.name === 'ASSORTED BAGELS')!;

  const single = foodLogAmounts(bagels, 1, bagels.macros as never);
  assert.equal(single.macros.carbsG, 70);
  const double = foodLogAmounts(bagels, 2, bagels.macros as never);
  assert.deepEqual(double.macros, { caloriesKcal: 706, proteinG: 24, carbsG: 140, fatG: 4.2 });
  // The micronutrients the hall published ride along with it.
  assert.ok(Object.keys(single.micros).length >= 4, 'published micronutrients reach the diary');

  // An unreported macro cannot be logged as zero: the sheet refuses rather than inventing one.
  const unreported = items.find(item => item.name === 'FRESH FRUIT TO GO')!;
  assert.throws(() => foodLogAmounts(unreported, 1, unreported.macros as never), RangeError);
});
