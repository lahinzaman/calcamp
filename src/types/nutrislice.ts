import type { DiningHallSlug } from './campus';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/** Nutrient units are encoded in the upstream keys. Absent/null means unknown. */
export interface NutrisliceNutritionInfo {
  calories?: number | null;
  g_fat?: number | null;
  g_saturated_fat?: number | null;
  g_trans_fat?: number | null;
  mg_cholesterol?: number | null;
  g_carbs?: number | null;
  g_added_sugar?: number | null;
  g_sugar?: number | null;
  mg_potassium?: number | null;
  mg_sodium?: number | null;
  g_fiber?: number | null;
  g_protein?: number | null;
  mg_iron?: number | null;
  mg_calcium?: number | null;
  mg_vitamin_c?: number | null;
  iu_vitamin_a?: number | null;
  re_vitamin_a?: number | null;
  mcg_vitamin_a?: number | null;
  mg_vitamin_d?: number | null;
  mcg_vitamin_d?: number | null;
  [nutrient: string]: number | null | undefined;
}

/** Typed projection of the fields consumed from Rutgers' week-menu JSON.
 * Rutgers currently supplies rounded_nutrition_info, not nutrition_info.
 * The latter is supported when supplied by other/upcoming payload versions.
 * Extra upstream display, ordering, and icon fields are intentionally ignored.
 */
export interface NutrisliceFood {
  id: number;
  name: string;
  nutrition_info?: NutrisliceNutritionInfo | null;
  rounded_nutrition_info?: NutrisliceNutritionInfo | null;
  serving_size_info?: {
    serving_size_amount: string | null;
    serving_size_unit: string | null;
  } | null;
}

export interface NutrisliceMenuItem {
  id: number;
  food: NutrisliceFood | null;
  is_section_title?: boolean;
  is_station_header?: boolean;
  /** Station name, carried by the header rows that separate the stations. */
  text?: string | null;
  serving_size?: string | null;
  serving_size_amount?: number | null;
  serving_size_unit?: string | null;
}

export interface NutrisliceMenuDay {
  date: string;
  menu_items: NutrisliceMenuItem[];
}

export interface NutrisliceWeekResponse {
  start_date?: string;
  menu_type_id?: number;
  days: NutrisliceMenuDay[];
}

export interface DailyMenuItem {
  dataFreshness?: 'fresh' | 'stale';
  cachedAt?: string;
  /** Includes meal and row ID: the same food can appear in several stations/meals. */
  id: string;
  diningHall: DiningHallSlug;
  date: string;
  meal: MealType;
  /** The station this food is served at, from the header row above it. */
  station: string | null;
  menuItemId: number;
  foodId: number;
  name: string;
  serving: {
    amount: number | null;
    unit: string | null;
    label: string | null;
  };
  macros: {
    caloriesKcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
  };
  /** Includes micros and source unit keys; never silently converts unknowns to zero. */
  nutrients: NutrisliceNutritionInfo;
}
