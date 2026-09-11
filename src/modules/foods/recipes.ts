import { durableStorage } from '../sync/storage';
import type { MacroTotals, MicronutrientTotals, NutrientKey } from '../../types/nutrition';
export interface RecipeItem { name: string; servings: number; macros: MacroTotals; micros: MicronutrientTotals }
export interface Recipe { id: string; name: string; yieldServings: number; items: RecipeItem[]; updatedAtMs: number }
const key = (owner: string) => `recipes:${owner}`;
export function readRecipes(owner: string): Recipe[] {
  try {
    const raw = durableStorage.get(key(owner));
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((recipe: Recipe) => recipe?.name && Array.isArray(recipe.items)) : [];
  } catch { return []; }
}
function write(owner: string, recipes: Recipe[]) {
  try { durableStorage.set(key(owner), JSON.stringify(recipes.slice(0, 100))); } catch { /* never block logging */ }
}
/** Totals for the whole recipe; one serving is this divided by the yield. */
export function recipeTotals(recipe: Pick<Recipe, 'items'>) {
  const macros: MacroTotals = { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  const micros: MicronutrientTotals = {};
  for (const item of recipe.items) {
    for (const field of Object.keys(macros) as (keyof MacroTotals)[]) macros[field] += item.macros[field] * item.servings;
    for (const [nutrient, amount] of Object.entries(item.micros) as [NutrientKey, number][]) micros[nutrient] = (micros[nutrient] ?? 0) + amount * item.servings;
  }
  return { macros, micros };
}
export function perServing(recipe: Pick<Recipe, 'items' | 'yieldServings'>) {
  const divisor = recipe.yieldServings > 0 ? recipe.yieldServings : 1;
  const { macros, micros } = recipeTotals(recipe);
  return {
    macros: Object.fromEntries(Object.entries(macros).map(([field, value]) => [field, value / divisor])) as unknown as MacroTotals,
    micros: Object.fromEntries(Object.entries(micros).map(([nutrient, value]) => [nutrient, value / divisor])) as MicronutrientTotals,
  };
}
export function saveRecipe(owner: string, recipe: Recipe): Recipe[] {
  if (!recipe.name.trim() || recipe.name.length > 80) throw new RangeError('Give the recipe a name of 1–80 characters.');
  if (!recipe.items.length) throw new RangeError('Add at least one ingredient.');
  if (!Number.isFinite(recipe.yieldServings) || recipe.yieldServings <= 0 || recipe.yieldServings > 100) throw new RangeError('A recipe must make between 0 and 100 servings.');
  const merged = [{ ...recipe, name: recipe.name.trim() }, ...readRecipes(owner).filter(existing => existing.id !== recipe.id)];
  write(owner, merged); return merged;
}
export function deleteRecipe(owner: string, id: string): Recipe[] {
  const merged = readRecipes(owner).filter(recipe => recipe.id !== id);
  write(owner, merged); return merged;
}
