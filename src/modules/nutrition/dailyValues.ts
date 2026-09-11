import { NUTRIENT_UNITS, type NutrientKey } from '../../types/nutrition';
export type NutrientGroup = 'macro' | 'vitamin' | 'mineral' | 'other';
/** FDA Daily Values for adults and children 4+ (2016 labeling rule).
 *  `kind: 'limit'` means stay under; `'goal'` means reach it. General reference, not medical advice. */
export interface DailyValue { amount: number; kind: 'goal' | 'limit'; group: NutrientGroup; label: string }
export const DAILY_VALUES: Partial<Record<NutrientKey, DailyValue>> = {
  fiber_g: { amount: 28, kind: 'goal', group: 'macro', label: 'Fibre' },
  added_sugar_g: { amount: 50, kind: 'limit', group: 'macro', label: 'Added sugar' },
  saturated_fat_g: { amount: 20, kind: 'limit', group: 'macro', label: 'Saturated fat' },
  cholesterol_mg: { amount: 300, kind: 'limit', group: 'macro', label: 'Cholesterol' },
  sodium_mg: { amount: 2300, kind: 'limit', group: 'mineral', label: 'Sodium' },
  potassium_mg: { amount: 4700, kind: 'goal', group: 'mineral', label: 'Potassium' },
  calcium_mg: { amount: 1300, kind: 'goal', group: 'mineral', label: 'Calcium' },
  iron_mg: { amount: 18, kind: 'goal', group: 'mineral', label: 'Iron' },
  magnesium_mg: { amount: 420, kind: 'goal', group: 'mineral', label: 'Magnesium' },
  phosphorus_mg: { amount: 1250, kind: 'goal', group: 'mineral', label: 'Phosphorus' },
  zinc_mg: { amount: 11, kind: 'goal', group: 'mineral', label: 'Zinc' },
  copper_mg: { amount: 0.9, kind: 'goal', group: 'mineral', label: 'Copper' },
  manganese_mg: { amount: 2.3, kind: 'goal', group: 'mineral', label: 'Manganese' },
  selenium_mcg: { amount: 55, kind: 'goal', group: 'mineral', label: 'Selenium' },
  iodine_mcg: { amount: 150, kind: 'goal', group: 'mineral', label: 'Iodine' },
  chromium_mcg: { amount: 35, kind: 'goal', group: 'mineral', label: 'Chromium' },
  molybdenum_mcg: { amount: 45, kind: 'goal', group: 'mineral', label: 'Molybdenum' },
  chloride_mg: { amount: 2300, kind: 'goal', group: 'mineral', label: 'Chloride' },
  vitamin_a_mcg_rae: { amount: 900, kind: 'goal', group: 'vitamin', label: 'Vitamin A' },
  vitamin_c_mg: { amount: 90, kind: 'goal', group: 'vitamin', label: 'Vitamin C' },
  vitamin_d_mcg: { amount: 20, kind: 'goal', group: 'vitamin', label: 'Vitamin D' },
  vitamin_e_mg: { amount: 15, kind: 'goal', group: 'vitamin', label: 'Vitamin E' },
  vitamin_k_mcg: { amount: 120, kind: 'goal', group: 'vitamin', label: 'Vitamin K' },
  thiamin_b1_mg: { amount: 1.2, kind: 'goal', group: 'vitamin', label: 'Thiamin (B1)' },
  riboflavin_b2_mg: { amount: 1.3, kind: 'goal', group: 'vitamin', label: 'Riboflavin (B2)' },
  niacin_b3_mg: { amount: 16, kind: 'goal', group: 'vitamin', label: 'Niacin (B3)' },
  pantothenic_acid_b5_mg: { amount: 5, kind: 'goal', group: 'vitamin', label: 'Pantothenic acid (B5)' },
  vitamin_b6_mg: { amount: 1.7, kind: 'goal', group: 'vitamin', label: 'Vitamin B6' },
  biotin_b7_mcg: { amount: 30, kind: 'goal', group: 'vitamin', label: 'Biotin (B7)' },
  folate_b9_mcg_dfe: { amount: 400, kind: 'goal', group: 'vitamin', label: 'Folate (B9)' },
  vitamin_b12_mcg: { amount: 2.4, kind: 'goal', group: 'vitamin', label: 'Vitamin B12' },
  choline_mg: { amount: 550, kind: 'goal', group: 'other', label: 'Choline' },
  caffeine_mg: { amount: 400, kind: 'limit', group: 'other', label: 'Caffeine' },
  water_g: { amount: 3700, kind: 'goal', group: 'other', label: 'Water' },
};
export const GROUP_LABELS: Record<NutrientGroup, string> = { macro: 'Fats, fibre & sugar', vitamin: 'Vitamins', mineral: 'Minerals', other: 'Other' };
export interface NutrientStatus { key: NutrientKey; label: string; amount: number; target: number; ratio: number; kind: 'goal' | 'limit'; group: NutrientGroup; unit: string }
/** Missing nutrients are unreported, not zero, so they are listed separately rather than shown at 0%. */
export function nutrientStatuses(consumed: Partial<Record<NutrientKey, number>>) {
  const tracked: NutrientStatus[] = [];
  const unreported: NutrientStatus[] = [];
  for (const [key, value] of Object.entries(DAILY_VALUES) as [NutrientKey, DailyValue][]) {
    const amount = consumed[key];
    const status: NutrientStatus = { key, label: value.label, amount: amount ?? 0, target: value.amount,
      ratio: value.amount ? (amount ?? 0) / value.amount : 0, kind: value.kind, group: value.group, unit: NUTRIENT_UNITS[key] };
    (amount === undefined ? unreported : tracked).push(status);
  }
  return { tracked, unreported };
}
