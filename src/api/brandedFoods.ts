import { getSupabase } from './supabase';
import type { SearchResult } from './foodSearch';

export interface BrandedRow {
  id: string; brand_name: string; item_name: string;
  serving_size_grams: number | null;
  calories: number; protein: number; carbs: number; fat: number;
}

/**
 * A tsquery from what someone has typed so far. The last word is still being typed, so it
 * matches as a prefix — without that, "chipo" finds nothing until the whole brand is spelled.
 * Anything that is not a letter or digit is dropped rather than escaped: the operators tsquery
 * understands are exactly what a search box must not pass through.
 */
export function toTsQuery(term: string): string | null {
  const words = term.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) return null;
  return words.map((word, index) => index === words.length - 1 ? `${word}:*` : word).join(' & ');
}

const amount = (value: unknown, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;

/**
 * A brand that published only some of its macros has published nothing usable, so the row is
 * dropped rather than completed with zeros. A missing gram weight is different: the serving is
 * still a serving, it just has no weight printed on it.
 */
export function parseBrandedFoods(value: unknown): SearchResult[] {
  if (!Array.isArray(value)) return [];
  const results: SearchResult[] = [];
  for (const entry of value) {
    const row = entry as Partial<BrandedRow> | null;
    if (!row || typeof row.id !== 'string' || typeof row.brand_name !== 'string' || typeof row.item_name !== 'string') continue;
    const brand = row.brand_name.trim(); const item = row.item_name.trim();
    if (!brand || !item) continue;
    const macros = {
      caloriesKcal: amount(row.calories, 20000), proteinG: amount(row.protein, 2000),
      carbsG: amount(row.carbs, 2000), fatG: amount(row.fat, 2000),
    };
    if (Object.values(macros).some(figure => figure === null)) continue;
    const grams = amount(row.serving_size_grams, 5000);
    results.push({
      key: `branded:${row.id}`, name: item, brand,
      macros: macros as SearchResult['macros'], micros: {},
      servingLabel: grams ? `${Math.round(grams)} g serving` : 'serving',
      quality: 'brand',
    });
  }
  return results;
}

/** Restaurant and fast-food items, searched on the brand and the item together. */
export async function searchBrandedFoods(term: string, signal: AbortSignal, limit = 12): Promise<SearchResult[]> {
  const query = toTsQuery(term);
  if (!query) return [];
  const { data, error } = await getSupabase().from('branded_foods')
    .select('id,brand_name,item_name,serving_size_grams,calories,protein,carbs,fat')
    .textSearch('search', query, { config: 'simple' })
    .order('brand_name').order('item_name')
    .limit(limit)
    .abortSignal(signal);
  if (error) throw new Error('Branded foods are unavailable right now.');
  return parseBrandedFoods(data);
}
