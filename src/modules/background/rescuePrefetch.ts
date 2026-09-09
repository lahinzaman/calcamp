import type { MacroTotals } from '../../types/nutrition';
import type { Coordinates, RescueResponse } from '../../types/rescue';
import { durableStorage, type DurableStorage } from '../sync/storage';
export interface RescuePrefetch { at: number; remaining: MacroTotals; location: Coordinates; result: RescueResponse }
/** Account-bound, short-lived hints. Changed diary totals invalidate the saved search. */
export function readRescuePrefetch(owner: string, remaining: MacroTotals, now = Date.now(), storage: DurableStorage = durableStorage): RescuePrefetch | null {
  try {
    const saved: RescuePrefetch = JSON.parse(storage.get(`rescue-prefetch:${owner}`) ?? 'null');
    if (!saved || now - saved.at < 0 || now - saved.at > 300000 || !Number.isFinite(saved.at)
      || !Number.isFinite(saved.location?.latitude) || !Number.isFinite(saved.location?.longitude)
      || !Array.isArray(saved.result?.matches) || !saved.remaining) return null;
    if (!(['caloriesKcal','proteinG','carbsG','fatG'] as const).every(key => saved.remaining[key] === remaining[key])) return null;
    return saved;
  } catch { return null; }
}
