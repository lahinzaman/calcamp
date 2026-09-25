import type { MacroTotals } from '../../types/nutrition';
import { usdaKey } from '../../api/usda';
import { normalizeBarcode } from './gtin';

export interface BarcodeServing {
  servingId: string; description: string;
  metricAmount: number | null; metricUnit: string | null;
  isDefault: boolean; macros: MacroTotals;
}
export interface BarcodeFood {
  name: string; brand: string | null; source: string;
  servings: BarcodeServing[];
  /** Index into `servings`; the portion the package itself leads with. */
  selected: number;
}
export class BarcodeUnknown extends Error {}

const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const OFF_FIELDS = 'product_name,product_name_en,brands,serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,nutriments';
const MACRO_FIELDS = { caloriesKcal: 'energy-kcal', proteinG: 'proteins', carbsG: 'carbohydrates', fatG: 'fat' } as const;
const SOURCE_OFF = 'Open Food Facts · values from the package as entered by shoppers; check them against your label';
const SOURCE_USDA = 'USDA branded foods · values as filed by the manufacturer; check them against your label';

const round = (value: number) => Math.round(value * 10) / 10;
/** A figure a real food could carry per 100 g: pure fat is 900 kcal, nothing edible passes 100 g of anything. */
function plausible(macros: MacroTotals, per100: boolean) {
  return !per100 || (macros.caloriesKcal <= 950 && macros.proteinG <= 100 && macros.carbsG <= 100 && macros.fatG <= 100);
}

/**
 * An Open Food Facts product. It publishes per-100 figures for nearly everything and per-serving
 * figures where the package states a serving; both are offered, the serving first, because the
 * serving is what the person is holding. A drink's per-100 figures are per 100 ml, and the
 * serving is labelled that way rather than passed off as grams.
 */
export function parseOpenFoodFacts(value: unknown): BarcodeFood | null {
  const body = value as { status?: unknown; product?: Record<string, unknown> } | null;
  const product = body?.product;
  if (body?.status !== 1 || !product) return null;
  const name = [product.product_name, product.product_name_en].find(text => typeof text === 'string' && text.trim()) as string | undefined;
  if (!name) return null;
  const nutriments = (product.nutriments ?? {}) as Record<string, unknown>;
  const read = (suffix: '_serving' | '_100g') => {
    const macros = Object.fromEntries(Object.entries(MACRO_FIELDS).map(([key, field]) => [key, nutriments[`${field}${suffix}`]]));
    return Object.values(macros).every(number) ? macros as unknown as MacroTotals : null;
  };
  const volume = product.nutrition_data_per === '100ml' || product.serving_quantity_unit === 'ml';
  const unit = volume ? 'ml' : 'g';
  const per100 = read('_100g');
  const quantity = Number(product.serving_quantity);
  const servingSize = typeof product.serving_size === 'string' && product.serving_size.trim() ? product.serving_size.trim() : null;
  let perServing = read('_serving');
  // A stated serving weight with only per-100 figures is scaled here, once, from the same numbers.
  if (!perServing && per100 && Number.isFinite(quantity) && quantity > 0) {
    perServing = Object.fromEntries(Object.entries(per100).map(([key, figure]) => [key, round(figure * quantity / 100)])) as unknown as MacroTotals;
  }
  const servings: BarcodeServing[] = [];
  if (perServing && plausible(perServing, false)) {
    servings.push({ servingId: 'serving', description: servingSize ?? '1 serving',
      metricAmount: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
      metricUnit: Number.isFinite(quantity) && quantity > 0 ? unit : null, isDefault: true, macros: perServing });
  }
  if (per100 && plausible(per100, true)) {
    servings.push({ servingId: '100', description: `100 ${unit}`, metricAmount: 100, metricUnit: unit, isDefault: !servings.length, macros: per100 });
  }
  if (!servings.length) {
    throw new BarcodeUnknown(`${name.trim()} is listed, but without a complete nutrition panel. Enter the package values by hand.`);
  }
  const brand = typeof product.brands === 'string' ? product.brands.split(',')[0].trim() || null : null;
  return { name: name.trim(), brand, source: SOURCE_OFF, servings, selected: 0 };
}

interface UsdaBranded {
  description?: string; brandName?: string; brandOwner?: string; gtinUpc?: string;
  servingSize?: number; servingSizeUnit?: string; householdServingFullText?: string;
  foodNutrients?: { nutrientNumber?: string; value?: number }[];
}
const USDA_MACROS = { '208': 'caloriesKcal', '203': 'proteinG', '205': 'carbsG', '204': 'fatG' } as const;

/**
 * A USDA branded record, kept only when its UPC is the one scanned: a text search for the digits
 * can also match them somewhere else in a record. Branded figures are per 100 g (or ml).
 */
export function parseUsdaBranded(value: unknown, gtin13: string): BarcodeFood | null {
  const foods = (value as { foods?: UsdaBranded[] })?.foods ?? [];
  const wanted = gtin13.replace(/^0+/, '');
  const food = foods.find(entry => typeof entry.gtinUpc === 'string' && entry.gtinUpc.replace(/^0+/, '') === wanted);
  if (!food || typeof food.description !== 'string' || !food.description.trim()) return null;
  const partial: Partial<MacroTotals> = {};
  for (const nutrient of food.foodNutrients ?? []) {
    const key = USDA_MACROS[nutrient.nutrientNumber as keyof typeof USDA_MACROS];
    if (key && number(nutrient.value)) partial[key] ??= nutrient.value;
  }
  if (!(['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const).every(key => number(partial[key]))) return null;
  const per100 = partial as MacroTotals;
  if (!plausible(per100, true)) return null;
  const unit = /^(ml|mlt)$/i.test(food.servingSizeUnit ?? '') ? 'ml' : 'g';
  const servings: BarcodeServing[] = [];
  const size = food.servingSize;
  if (typeof size === 'number' && Number.isFinite(size) && size > 0 && /^(g|grm|ml|mlt)$/i.test(food.servingSizeUnit ?? '')) {
    const household = food.householdServingFullText?.trim();
    servings.push({ servingId: 'serving', description: household ? `${household} (${round(size)} ${unit})` : `${round(size)} ${unit}`,
      metricAmount: size, metricUnit: unit, isDefault: true,
      macros: Object.fromEntries(Object.entries(per100).map(([key, figure]) => [key, round(figure * size / 100)])) as unknown as MacroTotals });
  }
  servings.push({ servingId: '100', description: `100 ${unit}`, metricAmount: 100, metricUnit: unit, isDefault: !servings.length, macros: per100 });
  const brand = (food.brandName || food.brandOwner || '').trim() || null;
  return { name: food.description.trim(), brand, source: SOURCE_USDA, servings, selected: 0 };
}

/** One request with its own deadline that still stops when the caller cancels. */
async function getJson(url: string, signal: AbortSignal, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController(); const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 10_000);
  signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json', ...headers } });
    return { status: response.status, body: await response.json().catch(() => null) };
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}

// Open Food Facts asks apps to name themselves. A browser forbids setting this header, so it is
// sent only from the app.
const appHeaders = (): Record<string, string> =>
  typeof navigator !== 'undefined' && navigator.product === 'ReactNative' ? { 'User-Agent': 'CalCamp/1.0 (iOS/Android app)' } : {};

/**
 * A scanner reports what is printed: a 12-digit UPC-A on a US package, an 8-digit UPC-E on a
 * small one. Everything is normalised to GTIN-13 first.
 *
 * Open Food Facts answers first: it is free, needs no key and no sign-in, and carries most US
 * packaged food. USDA's branded set is asked only when it misses. The lookup this replaced went
 * through FatSecret, whose barcode method is a paid Premier feature this project's key does not
 * have — so every scan and every typed code failed, whatever the barcode.
 */
export async function lookupBarcode(code: string, signal: AbortSignal): Promise<BarcodeFood> {
  const normalized = normalizeBarcode(code);
  if (!normalized) throw new BarcodeUnknown('That did not read as a food barcode. Try again, or enter the package values by hand.');
  const { gtin13 } = normalized;
  let unreachable = 0;
  let incomplete: BarcodeUnknown | null = null;
  try {
    const off = await getJson(`https://world.openfoodfacts.org/api/v2/product/${gtin13}.json?fields=${OFF_FIELDS}`, signal, appHeaders());
    if (off.status === 200 || off.status === 404) {
      const food = parseOpenFoodFacts(off.body);
      if (food) return food;
    } else unreachable++;
  } catch (cause) {
    if (signal.aborted) throw cause;
    if (cause instanceof BarcodeUnknown) incomplete = cause; else unreachable++;
  }
  // USDA files a UPC as the manufacturer printed it, usually twelve digits, so that form is asked first.
  const forms = [...new Set([gtin13.startsWith('0') ? gtin13.slice(1) : gtin13, gtin13])];
  for (const form of forms) {
    try {
      const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(usdaKey())}&dataType=Branded&pageSize=5&query=${form}`;
      const usda = await getJson(url, signal);
      if (usda.status !== 200) { unreachable++; break; }
      const food = parseUsdaBranded(usda.body, gtin13);
      if (food) return food;
    } catch (cause) {
      if (signal.aborted) throw cause;
      unreachable++; break;
    }
  }
  if (incomplete) throw incomplete;
  // Both databases answering "not here" is a real answer. One of them not answering is not.
  if (unreachable >= 2) throw new Error('Barcode lookup is unavailable. Check your connection, or enter this food manually.');
  throw new BarcodeUnknown('That barcode is not in the food databases yet. Enter the package values by hand.');
}
