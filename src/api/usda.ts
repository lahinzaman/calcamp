import type { MacroTotals, MicronutrientTotals, NutrientKey } from '../types/nutrition';
import type { SearchResult } from './foodSearch';

/**
 * USDA FoodData Central. Free, official, and the only source here that publishes a full
 * micronutrient profile — Open Food Facts and Nutrislice report roughly ten nutrients, which
 * is why most of the panel read "not reported" no matter what you logged.
 *
 * Nutrient numbers below were read off live responses rather than recalled; every value in
 * Foundation and SR Legacy is per 100 g.
 */
const ENDPOINT = 'https://api.nal.usda.gov/fdc/v1/foods/search';
/** USDA's shared key works without signup but is rate-limited per IP; a free key lifts that. */
export const DEMO_KEY = 'DEMO_KEY';
export const usdaKey = () => process.env.EXPO_PUBLIC_USDA_API_KEY?.trim() || DEMO_KEY;

type Conversion = { key: NutrientKey; factor?: number };
const NUTRIENTS: Record<string, Conversion> = {
  '291': { key: 'fiber_g' }, '269': { key: 'sugar_g' }, '539': { key: 'added_sugar_g' },
  '606': { key: 'saturated_fat_g' }, '645': { key: 'monounsaturated_fat_g' }, '646': { key: 'polyunsaturated_fat_g' },
  '605': { key: 'trans_fat_g' }, '601': { key: 'cholesterol_mg' },
  '307': { key: 'sodium_mg' }, '306': { key: 'potassium_mg' }, '301': { key: 'calcium_mg' },
  '303': { key: 'iron_mg' }, '304': { key: 'magnesium_mg' }, '305': { key: 'phosphorus_mg' },
  '309': { key: 'zinc_mg' }, '312': { key: 'copper_mg' }, '315': { key: 'manganese_mg' },
  '317': { key: 'selenium_mcg' }, '314': { key: 'iodine_mcg' }, '318': { key: 'chromium_mcg' },
  '319': { key: 'molybdenum_mcg' },
  // Fluoride is reported in micrograms; the app stores milligrams.
  '313': { key: 'fluoride_mg', factor: 0.001 },
  '320': { key: 'vitamin_a_mcg_rae' }, '401': { key: 'vitamin_c_mg' }, '328': { key: 'vitamin_d_mcg' },
  '323': { key: 'vitamin_e_mg' }, '430': { key: 'vitamin_k_mcg' },
  '404': { key: 'thiamin_b1_mg' }, '405': { key: 'riboflavin_b2_mg' }, '406': { key: 'niacin_b3_mg' },
  '410': { key: 'pantothenic_acid_b5_mg' }, '415': { key: 'vitamin_b6_mg' }, '416': { key: 'biotin_b7_mcg' },
  '435': { key: 'folate_b9_mcg_dfe' }, '418': { key: 'vitamin_b12_mcg' },
  '421': { key: 'choline_mg' }, '255': { key: 'water_g' }, '262': { key: 'caffeine_mg' }, '221': { key: 'alcohol_g' },
};
const MACRO_NUMBERS = { '208': 'caloriesKcal', '203': 'proteinG', '205': 'carbsG', '204': 'fatG' } as const;

/** How much to trust the numbers: lab-analysed, a reference table, or a manufacturer label. */
export type FoodQuality = 'lab' | 'reference' | 'brand';
export const QUALITY_LABELS: Record<FoodQuality, string> = {
  lab: 'USDA lab-analysed', reference: 'USDA reference data', brand: 'Manufacturer label',
};
const quality = (dataType: unknown): FoodQuality =>
  dataType === 'Foundation' ? 'lab' : dataType === 'Branded' ? 'brand' : 'reference';

const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

interface UsdaNutrient { nutrientNumber?: string; value?: number }
interface UsdaFood { fdcId?: number; description?: string; dataType?: string; brandName?: string; brandOwner?: string; foodNutrients?: UsdaNutrient[] }

/** A food without all four macros is unusable, exactly as with any other source. */
export function parseUsdaFoods(value: unknown): SearchResult[] {
  const foods = (value as { foods?: UsdaFood[] })?.foods ?? [];
  const results: SearchResult[] = [];
  for (const food of foods) {
    const name = typeof food.description === 'string' ? food.description.trim() : '';
    if (!name || !food.fdcId) continue;
    const macros: Partial<MacroTotals> = {};
    const micros: MicronutrientTotals = {};
    for (const nutrient of food.foodNutrients ?? []) {
      const number = nutrient.nutrientNumber;
      const raw = amount(nutrient.value);
      if (!number || raw === null) continue;
      const macro = MACRO_NUMBERS[number as keyof typeof MACRO_NUMBERS];
      if (macro) { macros[macro] ??= raw; continue; }
      const conversion = NUTRIENTS[number];
      if (conversion && micros[conversion.key] === undefined) micros[conversion.key] = raw * (conversion.factor ?? 1);
    }
    if (!(['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const).every(key => typeof macros[key] === 'number')) continue;
    results.push({
      key: `usda:${food.fdcId}`, name,
      brand: (food.brandName || food.brandOwner || '').trim() || null,
      macros: macros as MacroTotals, micros, servingLabel: '3.53 oz (100 g)',
      quality: quality(food.dataType),
    });
  }
  return results;
}

export class UsdaRateLimited extends Error {
  constructor() { super('The shared USDA key is rate limited. Add a free EXPO_PUBLIC_USDA_API_KEY to lift it.'); }
}

export async function searchUsdaFoods(term: string, signal: AbortSignal, pageSize = 15): Promise<SearchResult[]> {
  const query = term.trim();
  if (query.length < 2) return [];
  const controller = new AbortController(); const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 12_000);
  signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set('api_key', usdaKey());
    url.searchParams.set('query', query);
    url.searchParams.set('pageSize', String(pageSize));
    // Lab-analysed and reference foods first; branded entries are a manufacturer's own label.
    url.searchParams.set('dataType', 'Foundation,SR Legacy,Branded');
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (response.status === 429) throw new UsdaRateLimited();
    if (!response.ok) throw new Error('USDA food data is unavailable right now.');
    return parseUsdaFoods(await response.json());
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
