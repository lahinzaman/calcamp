import bundle from './usdaFoods.json';
import type { MacroTotals, MicronutrientTotals, NutrientKey } from '../types/nutrition';
import type { SearchResult } from '../api/foodSearch';

/**
 * USDA FoodData Central, downloaded and bundled rather than fetched: Foundation (lab
 * analysed) and SR Legacy (the reference tables behind most nutrition software). Fruit,
 * vegetables, meat, dairy, grains, snacks, sweets and a good many named products, all with
 * the full micronutrient profile the panel tracks.
 *
 * Bundled because search should answer instantly and work with no signal — the live API
 * still covers the 400,000 branded items nobody could ship in an app.
 *
 * Rows are stored positionally and nutrients by index; spelling the keys out per food would
 * roughly triple the file for no gain.
 */
type Row = [
  id: number, name: string, category: string, type: 0 | 1,
  kcal: number, protein: number, carbs: number, fat: number,
  micros: [index: number, amount: number][],
  portionGrams: number | null, portionLabel: string | null,
];
const data = bundle as { nutrients: string[]; foods: Row[] };

export const BUNDLED_FOOD_COUNT = data.foods.length;
/** Values in the dataset are per 100 g. */
const PER = 100;

export interface BundledFood {
  key: string; name: string; category: string;
  quality: 'lab' | 'reference';
  servingLabel: string; servingGrams: number;
  macros: MacroTotals; micros: MicronutrientTotals;
}

function decode(row: Row): BundledFood {
  const [id, name, category, type, kcal, protein, carbs, fat, micros, portionGrams, portionLabel] = row;
  // A household portion is what people actually eat; 100 g is the fallback, not the default.
  const grams = portionGrams && portionLabel ? portionGrams : PER;
  const scale = grams / PER;
  const scaled: MicronutrientTotals = {};
  for (const [index, amount] of micros) {
    const key = data.nutrients[index] as NutrientKey | undefined;
    if (key) scaled[key] = amount * scale;
  }
  return {
    key: `usda-bundled:${id}`, name, category,
    quality: type === 0 ? 'lab' : 'reference',
    servingGrams: grams,
    servingLabel: portionGrams && portionLabel
      ? `${portionLabel} (${Math.round(portionGrams)} g)` : '3.53 oz (100 g)',
    macros: { caloriesKcal: kcal * scale, proteinG: protein * scale, carbsG: carbs * scale, fatG: fat * scale },
    micros: scaled,
  };
}

let haystacks: string[] | null = null;
const index = () => (haystacks ??= data.foods.map(row => `${row[1]} ${row[2]}`.toLowerCase()));

/**
 * Every typed word must appear, so "greek yogurt" narrows instead of widening. A name that
 * starts with the first word outranks one that merely contains it, and a lab-analysed food
 * outranks a reference-table one at equal relevance.
 */
export function searchBundledFoods(term: string, limit = 20): BundledFood[] {
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const text = index();
  const hits: { row: Row; score: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    const haystack = text[i];
    let matched = true;
    for (const word of words) { if (!haystack.includes(word)) { matched = false; break; } }
    if (!matched) continue;
    const row = data.foods[i];
    const name = haystack;
    const score = (name.startsWith(words[0]) ? 0 : new RegExp(`\\b${words[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name) ? 1 : 2) * 2 + row[3];
    hits.push({ row, score });
    if (hits.length > 400) break;
  }
  return hits
    .sort((a, b) => a.score - b.score || a.row[1].length - b.row[1].length || a.row[1].localeCompare(b.row[1]))
    .slice(0, limit).map(hit => decode(hit.row));
}

export const toSearchResult = (food: BundledFood): SearchResult => ({
  key: food.key, name: food.name, brand: food.category || null,
  macros: food.macros, micros: food.micros, servingLabel: food.servingLabel, quality: food.quality,
});
