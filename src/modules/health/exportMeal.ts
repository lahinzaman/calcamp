import type { FoodEntry } from '../../types/foodEntry';
import type { HealthMeal } from './types';

/**
 * A diary entry as Apple Health wants it. `macros` on an entry is already the portion actually
 * eaten, so nothing is scaled here — scaling it again would export a meal nobody ate.
 *
 * The version rises with every export of the same id. HealthKit replaces a sample carrying a
 * known HKSyncIdentifier only when the version is higher, so a fixed version would make an
 * edited meal a duplicate it silently ignores.
 */
export function toHealthMeal(entry: FoodEntry, at = Date.now()): HealthMeal {
  return {
    id: entry.id,
    name: entry.name,
    date: new Date(entry.loggedAtMs).toISOString(),
    caloriesKcal: entry.macros.caloriesKcal,
    proteinG: entry.macros.proteinG,
    carbsG: entry.macros.carbsG,
    fatG: entry.macros.fatG,
    version: Math.floor(at / 1000),
  };
}

/**
 * Sends a logged meal to Apple Health, if the person connected it. Failure is swallowed on
 * purpose: the diary is the record, Health is a copy of it, and a copy that cannot be made must
 * not stop the thing being copied. The queue retries on its own.
 */
export function exportMealToHealth(entry: FoodEntry) {
  void (async () => {
    try {
      const { healthStore } = await import('./useHealthSync');
      // writeDietaryEnergy refuses when Health was never connected, which is the check.
      await healthStore.getState().writeDietaryEnergy(toHealthMeal(entry));
    } catch { /* Logged either way; the export queue retries. */ }
  })();
}
