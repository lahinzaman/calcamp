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
