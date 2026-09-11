import { durableStorage } from '../sync/storage';
import type { MacroTotals } from '../../types/nutrition';
const key = (owner: string) => `target-review:${owner}`;
export function readLastReview(owner: string): number | null {
  const raw = durableStorage.get(key(owner));
  const value = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(value) ? value : null;
}
export function writeLastReview(owner: string, at: number) {
  try { durableStorage.set(key(owner), String(at)); } catch { /* a full disk must not block the check-in */ }
}
/** Rescale macros to a new calorie total, protecting protein and holding the fat share steady. */
export function rescale(macros: MacroTotals, caloriesKcal: number): MacroTotals {
  const proteinG = Math.round(Math.min(macros.proteinG, caloriesKcal * .35 / 4));
  const fatShare = macros.caloriesKcal > 0 ? macros.fatG * 9 / macros.caloriesKcal : .28;
  const fatG = Math.round(caloriesKcal * fatShare / 9);
  return { caloriesKcal, proteinG, fatG, carbsG: Math.max(0, (caloriesKcal - proteinG * 4 - fatG * 9) / 4) };
}
