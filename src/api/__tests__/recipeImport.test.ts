import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseImportedRecipe, toRecipeDraft, RecipeImportError } from '../recipeImport';
import { perServing } from '../../modules/foods/recipes';

const imported = {
  title: 'Sunday chili', servings: 6, note: null,
  ingredients: [
    { name: 'beef, ground, cooked', grams: 900, macros: { caloriesKcal: 2151, proteinG: 234, carbsG: 0, fatG: 126 } },
    { name: 'onions, raw', grams: 220, macros: { caloriesKcal: 88, proteinG: 2.4, carbsG: 21, fatG: 0.2 } },
    { name: 'zzqq spice blend', grams: 12, macros: { caloriesKcal: 38, proteinG: 1.5, carbsG: 7, fatG: 1 } },
  ],
};

test('an imported page is refused unless every ingredient has a weight and macros', () => {
  assert.equal(parseImportedRecipe(imported).ingredients.length, 3);
  assert.throws(() => parseImportedRecipe({ ...imported, ingredients: [] }), RecipeImportError);
  assert.throws(() => parseImportedRecipe({ ...imported, ingredients: [{ name: 'beef', grams: 0, macros: imported.ingredients[0].macros }] }), RecipeImportError);
  assert.throws(() => parseImportedRecipe({ ...imported, ingredients: [{ name: 'beef', grams: 100, macros: { caloriesKcal: 1, proteinG: 1, carbsG: 1 } }] }), RecipeImportError);
  // A missing yield is one serving, never a divide by zero further down.
  assert.equal(parseImportedRecipe({ ...imported, servings: 0 }).servings, 1);
  assert.equal(parseImportedRecipe({ ...imported, title: '   ' }).title, 'Imported recipe');
});

test('ingredients resolve against USDA, and the ones that do not say so on their own row', () => {
  const { recipe, resolved, estimated } = toRecipeDraft(parseImportedRecipe(imported));
  assert.equal(recipe.name, 'Sunday chili');
  assert.equal(recipe.yieldServings, 6);
  assert.equal(resolved + estimated, 3);
  assert.equal(estimated, 1, 'the invented spice blend has no USDA entry');

  const [beef, , spice] = recipe.items;
  assert.match(beef.note!, /^900 g · USDA: /);
  assert.ok(Object.keys(beef.micros).length > 0, 'a resolved ingredient carries the micronutrients too');
  assert.match(spice.note!, /estimated, no USDA match/);
  assert.deepEqual(spice.micros, {}, 'an unresolved ingredient reports no micronutrients rather than zeros');
  assert.equal(spice.macros.caloriesKcal, 38, 'and keeps the figure it came with');

  // Every ingredient is one serving of its own gram weight, so the builder re-portions it
  // exactly as it re-portions anything else.
  for (const item of recipe.items) assert.equal(item.servings, 1);
  const single = perServing({ items: recipe.items, yieldServings: recipe.yieldServings });
  const whole = recipe.items.reduce((sum, item) => sum + item.macros.caloriesKcal, 0);
  assert.ok(Math.abs(single.macros.caloriesKcal - whole / 6) < 0.001, 'per serving is the whole recipe over its yield');
  assert.ok(single.macros.caloriesKcal > 0);
});
