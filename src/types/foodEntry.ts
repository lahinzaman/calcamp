import type { MacroTotals, MicronutrientTotals } from './nutrition';
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = typeof MEAL_SLOTS[number];
export const MEAL_LABELS: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };
/** Where the numbers came from, so the diary can show provenance and quality. */
export type FoodSource = 'dining' | 'barcode' | 'photo' | 'manual' | 'custom' | 'recipe' | 'quick';
export const SOURCE_LABELS: Record<FoodSource, string> = {
  dining: 'Campus dining', barcode: 'Barcode', photo: 'Photo estimate', manual: 'Manual entry', custom: 'Saved food', recipe: 'Recipe', quick: 'Quick add',
};
export interface FoodEntry {
  id: string;
  /** Device-local calendar date the entry belongs to, YYYY-MM-DD. */
  date: string;
  meal: MealSlot;
  name: string;
  /** Portion actually eaten, as a multiple of `referenceMacros`. */
  servings: number;
  servingLabel: string | null;
  macros: MacroTotals;
  micros: MicronutrientTotals;
  /** Per-single-serving values, kept so the portion stays re-editable. */
  referenceMacros: MacroTotals;
  referenceMicros: MicronutrientTotals;
  source: FoodSource;
  loggedAtMs: number;
}
export function mealForHour(hour: number): MealSlot {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}
export function scaleMacros(macros: MacroTotals, factor: number): MacroTotals {
  return { caloriesKcal: macros.caloriesKcal * factor, proteinG: macros.proteinG * factor, carbsG: macros.carbsG * factor, fatG: macros.fatG * factor };
}
export function scaleMicros(micros: MicronutrientTotals, factor: number): MicronutrientTotals {
  return Object.fromEntries(Object.entries(micros).map(([key, value]) => [key, value * factor])) as MicronutrientTotals;
}
