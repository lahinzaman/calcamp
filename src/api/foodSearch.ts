import type { MacroTotals, MicronutrientTotals } from '../types/nutrition';
export interface SearchResult {
  key: string; name: string; brand: string | null;
  /** Values for one serving of `servingLabel`. */
  macros: MacroTotals; micros: MicronutrientTotals; servingLabel: string;
  /** Where the numbers come from, so the list can say how much to trust a row. */
  quality?: 'lab' | 'reference' | 'brand' | 'crowd';
}
const NUM = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
/** Open Food Facts reports per 100 g; a product without all four macros is unusable, not zero. */
export function parseSearchProducts(value: unknown): SearchResult[] {
  const products = (value as { products?: Record<string, unknown>[] })?.products ?? [];
  const results: SearchResult[] = [];
  for (const product of products) {
    const nutriments = (product.nutriments ?? {}) as Record<string, unknown>;
    const name = typeof product.product_name === 'string' ? product.product_name.trim() : '';
    const calories = NUM(nutriments['energy-kcal_100g']); const protein = NUM(nutriments.proteins_100g);
    const carbs = NUM(nutriments.carbohydrates_100g); const fat = NUM(nutriments.fat_100g);
    if (!name || calories === null || protein === null || carbs === null || fat === null) continue;
    const micros: MicronutrientTotals = {};
    for (const [key, source] of [['fiber_g', 'fiber_100g'], ['sugar_g', 'sugars_100g'], ['sodium_mg', 'sodium_100g'], ['saturated_fat_g', 'saturated-fat_100g']] as const) {
      const amount = NUM(nutriments[source]);
      if (amount !== null) micros[key] = key === 'sodium_mg' ? amount * 1000 : amount;
    }
    results.push({ key: String(product.code ?? name), name, quality: 'crowd', brand: typeof product.brands === 'string' && product.brands ? product.brands.split(',')[0].trim() : null,
      macros: { caloriesKcal: calories, proteinG: protein, carbsG: carbs, fatG: fat }, micros, servingLabel: '3.53 oz (100 g)' });
  }
  return results;
}
export async function searchFoods(term: string, signal: AbortSignal): Promise<SearchResult[]> {
  const query = term.trim();
  if (query.length < 2) return [];
  const controller = new AbortController(); const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 12000);
  signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
  try {
    const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
    url.searchParams.set('search_terms', query); url.searchParams.set('search_simple', '1');
    url.searchParams.set('action', 'process'); url.searchParams.set('json', '1'); url.searchParams.set('page_size', '25');
    url.searchParams.set('fields', 'code,product_name,brands,nutriments');
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Food search is unavailable right now. Try again, or add the food manually.');
    return parseSearchProducts(await response.json());
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
