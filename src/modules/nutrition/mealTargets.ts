import { durableStorage } from '../sync/storage';
import { MEAL_SLOTS, type MealSlot } from '../../types/foodEntry';
import type { MacroTotals } from '../../types/nutrition';

export type MealSplit = Record<MealSlot, number>;
export interface SplitPreset { id: string; label: string; hint: string; split: MealSplit }

/**
 * Shares of the day, not fixed amounts, so a meal plan survives a target change. They are
 * a guide for pacing: eating 1,400 at dinner is not a failure, it just means the earlier
 * meals were light.
 */
export const SPLIT_PRESETS: SplitPreset[] = [
  { id: 'classic', label: 'Classic', hint: 'Breakfast, a solid lunch, the biggest meal at night',
    split: { breakfast: 25, lunch: 30, dinner: 35, snack: 10 } },
  { id: 'even', label: 'Even', hint: 'Three equal meals and a small snack',
    split: { breakfast: 30, lunch: 30, dinner: 30, snack: 10 } },
  { id: 'big-dinner', label: 'Big dinner', hint: 'Light until the evening',
    split: { breakfast: 15, lunch: 25, dinner: 50, snack: 10 } },
  { id: 'two-meals', label: 'Two meals', hint: 'Skip breakfast, eat the day in two sittings',
    split: { breakfast: 0, lunch: 45, dinner: 45, snack: 10 } },
  { id: 'front-loaded', label: 'Front-loaded', hint: 'Most of the day eaten before the evening',
    split: { breakfast: 35, lunch: 35, dinner: 25, snack: 5 } },
];
export const DEFAULT_SPLIT_ID = 'classic';
export const splitById = (id: string) => SPLIT_PRESETS.find(preset => preset.id === id) ?? SPLIT_PRESETS[0];

const key = (owner: string) => `meal-split:${owner}`;
export function readSplitId(owner: string): string {
  try { return splitById(durableStorage.get(key(owner)) ?? DEFAULT_SPLIT_ID).id; } catch { return DEFAULT_SPLIT_ID; }
}
export function writeSplitId(owner: string, id: string): string {
  const chosen = splitById(id).id;
  try { durableStorage.set(key(owner), chosen); } catch { /* a full disk must not block logging */ }
  return chosen;
}

/** Zero-share meals get no target rather than a zero one — nothing is "over" at 0 kcal. */
export function mealTargets(daily: MacroTotals | null | undefined, split: MealSplit): Partial<Record<MealSlot, MacroTotals>> {
  if (!daily) return {};
  const total = MEAL_SLOTS.reduce((sum, slot) => sum + (split[slot] ?? 0), 0);
  if (total <= 0) return {};
  const result: Partial<Record<MealSlot, MacroTotals>> = {};
  for (const slot of MEAL_SLOTS) {
    const share = (split[slot] ?? 0) / total;
    if (share <= 0) continue;
    result[slot] = {
      caloriesKcal: daily.caloriesKcal * share, proteinG: daily.proteinG * share,
      carbsG: daily.carbsG * share, fatG: daily.fatG * share,
    };
  }
  return result;
}
