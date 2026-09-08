import type { DailyMenuItem } from '../../types/nutrislice';
import type { MacroTotals, MicronutrientTotals, NutrientKey } from '../../types/nutrition';

const MICRO_KEYS: Record<string, NutrientKey> = {
  g_fiber: 'fiber_g', g_sugar: 'sugar_g', g_added_sugar: 'added_sugar_g',
  mg_sodium: 'sodium_mg', mg_potassium: 'potassium_mg', mg_calcium: 'calcium_mg',
  mg_iron: 'iron_mg', mg_vitamin_c: 'vitamin_c_mg', mg_cholesterol: 'cholesterol_mg',
  g_saturated_fat: 'saturated_fat_g', g_trans_fat: 'trans_fat_g',
};

/** Overrides are per listed serving; the resulting totals reflect the serving multiplier. */
export function foodLogAmounts(item: DailyMenuItem, servings: number, macros: MacroTotals) {
  if (!Number.isFinite(servings) || servings <= 0 || servings > 100) throw new RangeError('Enter 0–100 servings (greater than zero).');
  const consumed: MacroTotals = { ...macros };
  for (const key of ['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const) {
    if (!Number.isFinite(macros[key]) || macros[key] < 0) throw new RangeError('Complete all macro fields with nonnegative numbers.');
    consumed[key] *= servings;
    if (!Number.isFinite(consumed[key])) throw new RangeError('The portion is too large.');
  }
  const micros: MicronutrientTotals = {};
  for (const [source, destination] of Object.entries(MICRO_KEYS)) {
    const amount = item.nutrients[source];
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) micros[destination] = amount * servings;
  }
  // D is an unambiguous mass conversion. Vitamin A IU/RE is not silently treated as RAE.
  const vitaminD = item.nutrients.mcg_vitamin_d ?? (item.nutrients.mg_vitamin_d == null ? null : item.nutrients.mg_vitamin_d * 1000);
  if (vitaminD != null && Number.isFinite(vitaminD) && vitaminD >= 0) micros.vitamin_d_mcg = vitaminD * servings;
  return { macros: consumed, micros };
}
