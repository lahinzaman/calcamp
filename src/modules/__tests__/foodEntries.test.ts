import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNutritionStore } from '../../store/nutritionStore';
import { SyncEngine } from '../sync/engine';
import { memoryStorage } from '../sync/storage';
import { foodEntryRow, rowToFoodEntry } from '../../api/foodEntries';
import { mealForHour, scaleMacros } from '../../types/foodEntry';

const ref = { caloriesKcal: 200, proteinG: 10, carbsG: 20, fatG: 8 };
const at = (iso: string) => () => new Date(iso);

test('logging a food records the entry and moves totals by exactly that food', () => {
  const store = createNutritionStore({ now: at('2026-09-10T12:00:00') });
  const entry = store.getState().addEntry({ name: 'Rice bowl', servings: 2, referenceMacros: ref, referenceMicros: { sodium_mg: 50 }, source: 'dining' });
  assert.equal(entry.meal, 'lunch');
  assert.equal(entry.macros.caloriesKcal, 400);
  assert.equal(store.getState().consumedMacros.caloriesKcal, 400);
  assert.equal(store.getState().consumedMicros.sodium_mg, 100);
  assert.equal(store.getState().entries.length, 1);
  // The per-serving reference is retained so the portion stays editable.
  assert.deepEqual(entry.referenceMacros, ref);
});

test('removing a logged food subtracts it back out and undo restores the same totals', () => {
  const store = createNutritionStore({ now: at('2026-09-10T12:00:00') });
  store.getState().addEntry({ name: 'Toast', servings: 1, referenceMacros: ref, source: 'manual' });
  const second = store.getState().addEntry({ name: 'Eggs', servings: 1, referenceMacros: ref, source: 'manual' });
  assert.equal(store.getState().consumedMacros.caloriesKcal, 400);
  const removed = store.getState().undoLastEntry();
  assert.equal(removed?.id, second.id);
  assert.equal(store.getState().consumedMacros.caloriesKcal, 200);
  assert.equal(store.getState().entries.length, 1);
  store.getState().addEntry({ id: removed!.id, name: removed!.name, servings: removed!.servings, referenceMacros: removed!.referenceMacros, source: removed!.source });
  assert.equal(store.getState().consumedMacros.caloriesKcal, 400);
  assert.equal(store.getState().removeEntry('missing'), null);
});

test('re-portioning adjusts totals by the difference only, and rejects invalid portions', () => {
  const store = createNutritionStore({ now: at('2026-09-10T09:00:00') });
  const entry = store.getState().addEntry({ name: 'Oats', servings: 1, referenceMacros: ref, source: 'manual' });
  assert.equal(entry.meal, 'breakfast');
  store.getState().updateEntry(entry.id, { servings: 3, meal: 'snack' });
  assert.equal(store.getState().consumedMacros.caloriesKcal, 600);
  assert.equal(store.getState().entries[0].meal, 'snack');
  assert.deepEqual(store.getState().entries[0].macros, scaleMacros(ref, 3));
  assert.throws(() => store.getState().updateEntry(entry.id, { servings: 0 }));
  assert.throws(() => store.getState().addEntry({ name: '', servings: 1, referenceMacros: ref, source: 'manual' }));
  assert.throws(() => store.getState().addEntry({ name: 'x', servings: 101, referenceMacros: ref, source: 'manual' }));
});

test('a removal can never drive a total negative when cloud totals arrived without entries', () => {
  const store = createNutritionStore({ now: at('2026-09-10T12:00:00') });
  const entry = store.getState().addEntry({ name: 'Soup', servings: 1, referenceMacros: ref, source: 'manual' });
  store.setState({ consumedMacros: { caloriesKcal: 50, proteinG: 0, carbsG: 0, fatG: 0 } });
  store.getState().removeEntry(entry.id);
  for (const value of Object.values(store.getState().consumedMacros)) assert.ok(value >= 0);
});

test('entries persist offline across a restart and queue one row mutation each', async () => {
  const storage = memoryStorage(); let sent = 0;
  const engine = new SyncEngine(storage, async () => { sent++; });
  engine.activate('alice'); engine.setOnline(false);
  const store = createNutritionStore({ now: at('2026-09-10T12:00:00') });
  const entry = store.getState().addEntry({ name: 'Chicken', servings: 1, referenceMacros: ref, source: 'dining' });
  engine.recordEntries('2026-09-10', [entry], []);
  assert.equal(engine.data.queue.filter(q => q.kind === 'food-entry').length, 1);

  const next = new SyncEngine(storage, async () => { sent++; });
  next.activate('alice');
  assert.deepEqual(next.data.entries?.['2026-09-10'], [entry]);
  next.recordEntries('2026-09-10', [], [entry]);
  const jobs = next.data.queue.filter(q => q.kind === 'food-entry');
  // The superseded upsert is dropped; only the delete needs to reach the server.
  assert.equal(jobs.length, 1);
  assert.equal((jobs[0] as { data: { op: string } }).data.op, 'delete');
  await next.drain(); assert.equal(sent, 1);
  next.activate('bob'); assert.deepEqual(next.data.entries, {});
});

test('entry rows round-trip through the Supabase column mapping', () => {
  const store = createNutritionStore({ now: at('2026-09-10T19:00:00') });
  const entry = store.getState().addEntry({ name: 'Stir fry', servings: 1.5, servingLabel: '8 oz', referenceMacros: ref, referenceMicros: { iron_mg: 2 }, source: 'barcode' });
  assert.equal(entry.meal, 'dinner');
  const round = rowToFoodEntry(foodEntryRow('alice', entry) as unknown as Record<string, unknown>);
  assert.deepEqual(round, entry);
  assert.equal(mealForHour(23), 'snack');
});

test('recents merge repeats, favourites persist, and ordering separates recent from frequent', () => {
  const { readSavedFoods, rememberFood, toggleFavorite, orderFoods, forgetFood } = require('../foods/savedFoods') as typeof import('../foods/savedFoods');
  const base = { servingLabel: '1 cup', micros: {}, source: 'manual' as const };
  rememberFood('alice', { ...base, name: 'Oats', macros: ref }, 1000);
  rememberFood('alice', { ...base, name: 'Oats', macros: ref }, 2000);
  rememberFood('alice', { ...base, name: 'Yogurt', macros: ref }, 3000);
  const saved = readSavedFoods('alice');
  assert.equal(saved.length, 2);
  assert.equal(saved.find(f => f.name === 'Oats')!.uses, 2);
  assert.equal(orderFoods(saved, 'recent')[0].name, 'Yogurt');
  assert.equal(orderFoods(saved, 'frequent')[0].name, 'Oats');
  assert.equal(orderFoods(saved, 'favorite').length, 0);
  const starred = toggleFavorite('alice', saved.find(f => f.name === 'Oats')!.key);
  assert.equal(orderFoods(starred, 'favorite')[0].name, 'Oats');
  assert.equal(forgetFood('alice', starred[0].key).length, 1);
});

test('food search skips products missing any macro rather than reading them as zero', () => {
  const { parseSearchProducts } = require('../../api/foodSearch') as typeof import('../../api/foodSearch');
  const results = parseSearchProducts({ products: [
    { code: '1', product_name: 'Complete', brands: 'Acme, Other', nutriments: { 'energy-kcal_100g': 120, proteins_100g: 5, carbohydrates_100g: 20, fat_100g: 2, sodium_100g: 0.4 } },
    { code: '2', product_name: 'Missing fat', nutriments: { 'energy-kcal_100g': 120, proteins_100g: 5, carbohydrates_100g: 20 } },
    { code: '3', product_name: '', nutriments: { 'energy-kcal_100g': 1, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } },
  ] });
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Complete');
  assert.equal(results[0].brand, 'Acme');
  // Open Food Facts reports sodium in grams; the app stores milligrams.
  assert.equal(results[0].micros.sodium_mg, 400);
});

test('recipe totals scale by ingredient servings and divide by the yield', () => {
  const { perServing, recipeTotals, saveRecipe, readRecipes, deleteRecipe } = require('../foods/recipes') as typeof import('../foods/recipes');
  const recipe = { id: 'r1', name: 'Chili', yieldServings: 4, updatedAtMs: 0, items: [
    { name: 'Beef', servings: 2, macros: { caloriesKcal: 200, proteinG: 20, carbsG: 0, fatG: 12 }, micros: { iron_mg: 2 } },
    { name: 'Beans', servings: 1, macros: { caloriesKcal: 120, proteinG: 7, carbsG: 22, fatG: 1 }, micros: { iron_mg: 3 } },
  ] };
  assert.equal(recipeTotals(recipe).macros.caloriesKcal, 520);
  assert.equal(recipeTotals(recipe).micros.iron_mg, 7);
  assert.equal(perServing(recipe).macros.caloriesKcal, 130);
  assert.equal(perServing(recipe).micros.iron_mg, 1.75);
  assert.equal(saveRecipe('alice', recipe).length, 1);
  assert.equal(readRecipes('alice')[0].name, 'Chili');
  assert.throws(() => saveRecipe('alice', { ...recipe, items: [] }));
  assert.throws(() => saveRecipe('alice', { ...recipe, yieldServings: 0 }));
  assert.equal(deleteRecipe('alice', 'r1').length, 0);
});
