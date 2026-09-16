import type { MacroTotals } from '../../types/nutrition';
import { getSupabase } from '../../api/supabase';
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

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * Every serving keeps the macros FatSecret scaled to it. Choosing a portion means choosing a
 * serving, never multiplying another serving's numbers — the old path read one serving's values
 * and showed them for whichever portion was picked.
 */
export function parseBarcodeFood(value: unknown): BarcodeFood {
  const food = value as { itemName?: unknown; brandName?: unknown; servings?: unknown; defaultServingId?: unknown } | null;
  const rows = Array.isArray(food?.servings) ? food!.servings : [];
  const servings: BarcodeServing[] = [];
  for (const entry of rows) {
    const row = entry as Record<string, unknown>;
    const macros = row.macros as Partial<MacroTotals> | undefined;
    if (typeof row.servingId !== 'string' || typeof row.description !== 'string' || !macros
      || !(['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const).every(key => number(macros[key]))) continue;
    servings.push({ servingId: row.servingId, description: row.description,
      metricAmount: number(row.metricAmount) ? row.metricAmount as number : null,
      metricUnit: typeof row.metricUnit === 'string' ? row.metricUnit : null,
      isDefault: row.isDefault === true, macros: macros as MacroTotals });
  }
  if (typeof food?.itemName !== 'string' || !food.itemName.trim() || !servings.length) {
    throw new BarcodeUnknown('No complete nutrition panel was found for that barcode. Enter the package values by hand.');
  }
  const wanted = servings.findIndex(serving => serving.servingId === food.defaultServingId);
  return {
    name: food.itemName.trim(), brand: typeof food.brandName === 'string' && food.brandName.trim() ? food.brandName.trim() : null,
    source: 'FatSecret · values as published for the serving you pick; verify your package label',
    servings, selected: wanted >= 0 ? wanted : Math.max(0, servings.findIndex(serving => serving.isDefault)),
  };
}

/**
 * A scanner reports what is printed: a 12-digit UPC-A on a US package, an 8-digit UPC-E on a
 * small one. The lookup takes GTIN-13 and nothing else, so the scan is normalised here — sending
 * it unchanged is how a scan of a real product came back as nothing at all.
 */
export async function lookupBarcode(code: string, signal: AbortSignal, accessToken?: () => Promise<string | null>): Promise<BarcodeFood> {
  const normalized = normalizeBarcode(code);
  if (!normalized) throw new BarcodeUnknown('That did not read as a food barcode. Try again, or enter the package values by hand.');
  const base = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!base) throw new BarcodeUnknown('Barcode lookup is not set up on this build. Enter the package values by hand.');
  const token = accessToken ? await accessToken() : await (async () => {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) throw error;
    return data.session?.access_token ?? null;
  })();
  if (!token) throw new BarcodeUnknown('Sign in to look up a barcode.');
  const response = await fetch(`${base.replace(/\/$/, '')}/api/search-branded/barcode?gtin=${normalized.gtin13}`,
    { signal, headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new BarcodeUnknown(body?.error?.message ?? 'That barcode is not in the food database. Enter the package values by hand.');
  }
  if (!response.ok) throw new Error('Barcode lookup is unavailable. Enter this food manually.');
  return parseBarcodeFood(await response.json());
}
