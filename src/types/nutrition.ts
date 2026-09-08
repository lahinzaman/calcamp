/** Canonical units shared with supabase/schema.sql. Never store percent daily values. */
export const NUTRIENT_UNITS = {
  fiber_g: 'g',
  soluble_fiber_g: 'g',
  insoluble_fiber_g: 'g',
  resistant_starch_g: 'g',
  beta_glucan_g: 'g',
  inulin_g: 'g',
  sugar_g: 'g',
  added_sugar_g: 'g',
  sugar_alcohol_g: 'g',
  starch_g: 'g',
  saturated_fat_g: 'g',
  monounsaturated_fat_g: 'g',
  polyunsaturated_fat_g: 'g',
  trans_fat_g: 'g',
  omega_3_g: 'g',
  omega_6_g: 'g',
  ala_g: 'g',
  epa_g: 'g',
  dha_g: 'g',
  cholesterol_mg: 'mg',
  sodium_mg: 'mg',
  potassium_mg: 'mg',
  calcium_mg: 'mg',
  iron_mg: 'mg',
  magnesium_mg: 'mg',
  phosphorus_mg: 'mg',
  zinc_mg: 'mg',
  copper_mg: 'mg',
  manganese_mg: 'mg',
  selenium_mcg: 'mcg',
  iodine_mcg: 'mcg',
  chromium_mcg: 'mcg',
  molybdenum_mcg: 'mcg',
  chloride_mg: 'mg',
  fluoride_mg: 'mg',
  vitamin_a_mcg_rae: 'mcg_rae',
  retinol_mcg: 'mcg',
  beta_carotene_mcg: 'mcg',
  alpha_carotene_mcg: 'mcg',
  lycopene_mcg: 'mcg',
  lutein_zeaxanthin_mcg: 'mcg',
  vitamin_c_mg: 'mg',
  vitamin_d_mcg: 'mcg',
  vitamin_e_mg: 'mg',
  vitamin_k_mcg: 'mcg',
  thiamin_b1_mg: 'mg',
  riboflavin_b2_mg: 'mg',
  niacin_b3_mg: 'mg',
  pantothenic_acid_b5_mg: 'mg',
  vitamin_b6_mg: 'mg',
  biotin_b7_mcg: 'mcg',
  folate_b9_mcg_dfe: 'mcg_dfe',
  folic_acid_mcg: 'mcg',
  vitamin_b12_mcg: 'mcg',
  choline_mg: 'mg',
  betaine_mg: 'mg',
  histidine_g: 'g',
  isoleucine_g: 'g',
  leucine_g: 'g',
  lysine_g: 'g',
  methionine_g: 'g',
  phenylalanine_g: 'g',
  threonine_g: 'g',
  tryptophan_g: 'g',
  valine_g: 'g',
  alanine_g: 'g',
  arginine_g: 'g',
  aspartic_acid_g: 'g',
  asparagine_g: 'g',
  cysteine_g: 'g',
  cystine_g: 'g',
  glutamic_acid_g: 'g',
  glutamine_g: 'g',
  glycine_g: 'g',
  proline_g: 'g',
  serine_g: 'g',
  tyrosine_g: 'g',
  water_g: 'g',
  caffeine_mg: 'mg',
  alcohol_g: 'g',
} as const;

export type NutrientKey = keyof typeof NUTRIENT_UNITS;
export type NutrientUnit = (typeof NUTRIENT_UNITS)[NutrientKey];

/** Missing keys mean unreported, not zero. Values are known consumed subtotals. */
export type MicronutrientTotals = Partial<Record<NutrientKey, number>>;

export interface MacroTotals {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface NutritionTargets {
  macros: MacroTotals;
  /** Targets may represent minimums or limits; the later nutrition module interprets them. */
  micronutrients: MicronutrientTotals;
}

export function emptyMacros(): MacroTotals {
  return { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
}
