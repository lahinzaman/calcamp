import type { MacroTotals } from './nutrition';
export interface Coordinates { latitude: number; longitude: number }
export const EASTON_AVE: Coordinates = { latitude: 40.4989, longitude: -74.4477 };
export type MacroPreference = 'protein' | 'carbs';
export interface RescueMeal { id: string; name: string; macros: MacroTotals; sourceUrl: string; reviewedAt: string }
export interface RescueMatch {
  placeId: string; restaurant: string; address: string; rating: number; reviewCount: number;
  mapsUrl: string; meal: RescueMeal; attributions: { provider: string; uri?: string }[];
}
export interface RescueResponse { matches: RescueMatch[]; eligibleRestaurants: number; uncoveredRestaurants: number; checkedAt: string }
export function remainingMacros(targets: MacroTotals, consumed: MacroTotals): MacroTotals {
  return Object.fromEntries((Object.keys(targets) as (keyof MacroTotals)[]).map(key => [key, Math.max(0, targets[key] - consumed[key])])) as unknown as MacroTotals;
}
/** New York calendar day: 22:00–23:59. At midnight the diary and gate reset. */
export function rescueEligible(remaining: MacroTotals | null, now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(now));
  return !!remaining && Number.isFinite(remaining.caloriesKcal) && remaining.caloriesKcal > 400 && hour >= 22;
}
export function fitsMacros(meal: MacroTotals, remaining: MacroTotals, preference: MacroPreference) {
  return (['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const).every(key => Number.isFinite(meal[key]) && meal[key] >= 0 && Number.isFinite(remaining[key]) && meal[key] <= remaining[key])
    && meal.caloriesKcal > 0 && (preference === 'protein' ? meal.proteinG >= 20 : meal.carbsG >= 30);
}
