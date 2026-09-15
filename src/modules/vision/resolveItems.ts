import { searchBundledFoods, type BundledFood } from '../../data/usdaFoods';
import type { MacroTotals, MicronutrientTotals } from '../../types/nutrition';

/** Where a row's numbers came from. Never collapse these: one is measured, one is guessed. */
export type ItemSource = 'usda' | 'estimated';
export interface RecognizedItem {
  name: string;
  grams: number;
  confidence: number;
  macros: MacroTotals;
  micros: MicronutrientTotals;
  source: ItemSource;
  /** The bundled food the numbers came from, so the row can say which it matched. */
  matchedName: string | null;
  matchedKey: string | null;
}

const scale = (macros: MacroTotals, ratio: number): MacroTotals => ({
  caloriesKcal: macros.caloriesKcal * ratio, proteinG: macros.proteinG * ratio,
  carbsG: macros.carbsG * ratio, fatG: macros.fatG * ratio,
});
const round = (macros: MacroTotals): MacroTotals => ({
  caloriesKcal: Math.round(macros.caloriesKcal), proteinG: Number(macros.proteinG.toFixed(1)),
  carbsG: Number(macros.carbsG.toFixed(1)), fatG: Number(macros.fatG.toFixed(1)),
});

/**
 * Words that say how a food was prepared or served rather than what it is. Dropping one to find
 * a match is safe — "oatmeal, cooked" is still oatmeal. Dropping a word outside this list is
 * not: "dressing" is a different food from "caesar dressing".
 */
const PREPARATION = new Set(['cooked', 'raw', 'grilled', 'baked', 'fried', 'roasted', 'boiled', 'steamed',
  'broiled', 'sauteed', 'sautéed', 'poached', 'toasted', 'fresh', 'frozen', 'canned', 'dried', 'sliced',
  'chopped', 'diced', 'shredded', 'plain', 'hot', 'cold', 'warm', 'large', 'small', 'medium', 'bowl',
  'scoop', 'serving', 'portion', 'piece', 'pieces', 'cup', 'a', 'of', 'with', 'and', 'the']);
const wordsOf = (name: string) => name.toLowerCase().replace(/[(),.]/g, ' ').split(/\s+/).filter(Boolean);
/** What the food actually is, once preparation and filler are set aside. */
const identityWords = (name: string) => {
  const identity = wordsOf(name).filter(word => !PREPARATION.has(word));
  return identity.length ? identity : wordsOf(name);
};

/**
 * A recognised name is prose ("grilled chicken breast"); a USDA name is a taxonomy entry
 * ("Chicken, broilers or fryers, breast, meat only, cooked"). Bundled search needs every word
 * to appear, so the full phrase usually misses and the query has to be narrowed a word at a
 * time — widest window first, so the most specific match that exists is the one found.
 */
/** Bounded so one long import cannot grow it without limit; repeated ingredients are common. */
const lookups = new Map<string, BundledFood | null>();
function lookup(query: string): BundledFood | null {
  const cached = lookups.get(query);
  if (cached !== undefined) return cached;
  const [food] = searchBundledFoods(query, 1);
  if (lookups.size > 500) lookups.clear();
  lookups.set(query, food ?? null);
  return food ?? null;
}

export function findBundled(name: string): { food: BundledFood; matched: string[] } | null {
  const words = wordsOf(name);
  if (!words.length) return null;
  // Only a window holding every identity word can be accepted downstream, so the rest are not
  // worth a search. Searching all of them meant a five-word ingredient scanned the whole 7,833
  // catalogue fifteen times, all but one of those scans for a window that would be rejected.
  const identity = new Set(identityWords(name));
  const firstIdentity = words.findIndex(word => identity.has(word));
  const lastIdentity = words.length - 1 - [...words].reverse().findIndex(word => identity.has(word));
  const from = firstIdentity < 0 ? 0 : firstIdentity;
  const to = firstIdentity < 0 ? words.length - 1 : lastIdentity;
  // Widest window first, so the most specific match that exists is the one found.
  for (let size = words.length; size >= 1; size--) {
    for (let start = 0; start + size <= words.length; start++) {
      if (start > from || start + size - 1 < to) continue;
      const window = words.slice(start, start + size);
      const food = lookup(window.join(' '));
      if (food) return { food, matched: window };
    }
  }
  return null;
}

/**
 * USDA figures replace the model's own only when the match named the same food. Every word that
 * carries identity has to have taken part: "oatmeal" may stand in for "oatmeal, cooked", because
 * only a preparation word was dropped, but "dressing" may not stand in for "caesar dressing" —
 * that is a different food wearing the right noun.
 */
export function resolveItem(item: { name: string; grams: number; confidence: number; macros: MacroTotals }): RecognizedItem {
  const base = { name: item.name, grams: item.grams, confidence: item.confidence };
  const match = findBundled(item.name);
  const covered = match ? identityWords(item.name).every(word => match.matched.includes(word)) : false;
  // A name can collide across foods that share a word but nothing else — "oatmeal" finds an
  // oatmeal cookie, six times the energy of the porridge that was eaten. The model's own
  // estimate is the check: agree on roughly how dense the food is, or it is not the same food.
  const theirs = item.grams > 0 ? item.macros.caloriesKcal / item.grams : 0;
  const ours = match && match.food.servingGrams > 0 ? match.food.macros.caloriesKcal / match.food.servingGrams : 0;
  const disagreement = theirs > 0 && ours > 0 ? Math.max(ours / theirs, theirs / ours) : Number.POSITIVE_INFINITY;
  const plausible = (theirs <= .05 && ours <= .05) || disagreement <= 2.5;
  if (!match || !covered || !plausible) {
    return { ...base, macros: round(item.macros), micros: {}, source: 'estimated', matchedName: null, matchedKey: null };
  }
  const ratio = item.grams / match.food.servingGrams;
  const micros: MicronutrientTotals = {};
  for (const [key, amount] of Object.entries(match.food.micros)) micros[key as keyof MicronutrientTotals] = amount * ratio;
  return { ...base, macros: round(scale(match.food.macros, ratio)), micros,
    source: 'usda', matchedName: match.food.name, matchedKey: match.food.key };
}

export const resolveItems = (items: { name: string; grams: number; confidence: number; macros: MacroTotals }[]) => items.map(resolveItem);

/** Totals across the rows the user has kept, for the confirmation summary. */
export function totalMacros(items: { macros: MacroTotals }[]): MacroTotals {
  return items.reduce((sum, item) => ({
    caloriesKcal: sum.caloriesKcal + item.macros.caloriesKcal, proteinG: sum.proteinG + item.macros.proteinG,
    carbsG: sum.carbsG + item.macros.carbsG, fatG: sum.fatG + item.macros.fatG,
  }), { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}

/** Re-scales a row to a new gram weight, keeping whichever source it already resolved to. */
export function reportion(item: RecognizedItem, grams: number): RecognizedItem {
  if (!Number.isFinite(grams) || grams <= 0 || item.grams <= 0) return item;
  const ratio = grams / item.grams;
  const micros: MicronutrientTotals = {};
  for (const [key, amount] of Object.entries(item.micros)) micros[key as keyof MicronutrientTotals] = amount * ratio;
  return { ...item, grams, macros: round(scale(item.macros, ratio)), micros };
}
