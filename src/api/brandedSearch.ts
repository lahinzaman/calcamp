import { getSupabase } from './supabase';
import type { SearchResult } from './foodSearch';

/** What the backend returns for one FatSecret hit. Macros are against `servingLabel`, which is
 *  "1 serving" for a brand and "100g" for anything measured that way. */
interface BrandedSuggestion {
  key: string; brandName: string; itemName: string; servingLabel: string;
  macros: { caloriesKcal: number; proteinG: number; carbsG: number; fatG: number };
  foodId: string | null;
}

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** A hit missing any macro is dropped rather than logged as a food containing none of it. */
export function parseBrandedSearch(value: unknown): SearchResult[] {
  const items = (value as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const results: SearchResult[] = [];
  for (const entry of items) {
    const row = entry as Partial<BrandedSuggestion> | null;
    const macros = row?.macros;
    if (!row || typeof row.key !== 'string' || typeof row.brandName !== 'string' || typeof row.itemName !== 'string'
      || !row.brandName.trim() || !row.itemName.trim()
      || !macros || !(['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const).every(key => number(macros[key]))) continue;
    results.push({
      key: row.key, name: row.itemName.trim(), brand: row.brandName.trim(),
      macros: macros as SearchResult['macros'], micros: {},
      servingLabel: typeof row.servingLabel === 'string' && row.servingLabel.trim() ? row.servingLabel.trim() : 'serving',
      quality: 'brand',
    });
  }
  return results;
}

/** Restaurant and fast-food items, through the backend so the provider credentials stay there. */
export async function searchBrandedApi(term: string, signal: AbortSignal, accessToken?: () => Promise<string | null>): Promise<SearchResult[]> {
  const base = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!base) return [];
  const token = accessToken ? await accessToken() : await (async () => {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) throw error;
    return data.session?.access_token ?? null;
  })();
  if (!token) return [];
  const url = `${base.replace(/\/$/, '')}/api/search-branded?query=${encodeURIComponent(term)}`;
  const response = await fetch(url, { signal, headers: { Authorization: `Bearer ${token}` } });
  // A brand source being down must not empty a list the other sources filled.
  if (!response.ok) throw new Error('Branded food search is unavailable right now.');
  return parseBrandedSearch(await response.json());
}
