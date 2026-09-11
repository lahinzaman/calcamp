import { durableStorage } from '../sync/storage';
import type { MacroTotals, MicronutrientTotals } from '../../types/nutrition';
import type { FoodSource } from '../../types/foodEntry';
export interface SavedFood {
  key: string; name: string; servingLabel: string | null;
  macros: MacroTotals; micros: MicronutrientTotals; source: FoodSource;
  /** How often it has been logged, and when last — drives the frequent/recent ordering. */
  uses: number; lastUsedMs: number; favorite: boolean;
}
const RECENT_LIMIT = 60;
const key = (owner: string) => `saved-foods:${owner}`;
export function readSavedFoods(owner: string): SavedFood[] {
  try {
    const raw = durableStorage.get(key(owner));
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((food: SavedFood) => food && typeof food.name === 'string' && food.macros) : [];
  } catch { return []; }
}
function write(owner: string, foods: SavedFood[]) {
  try { durableStorage.set(key(owner), JSON.stringify(foods.slice(0, RECENT_LIMIT))); } catch { /* a full disk must not block logging */ }
}
/** Identity for dedupe: name plus serving, so the same food logged twice merges. */
export const foodKey = (name: string, servingLabel: string | null) => `${name.trim().toLowerCase()}|${(servingLabel ?? '').trim().toLowerCase()}`;
export function rememberFood(owner: string, food: Omit<SavedFood, 'uses' | 'lastUsedMs' | 'favorite' | 'key'>, now = Date.now()): SavedFood[] {
  const id = foodKey(food.name, food.servingLabel);
  const existing = readSavedFoods(owner);
  const previous = existing.find(item => item.key === id);
  const next: SavedFood = { ...food, key: id, uses: (previous?.uses ?? 0) + 1, lastUsedMs: now, favorite: previous?.favorite ?? false };
  const merged = [next, ...existing.filter(item => item.key !== id)];
  write(owner, merged); return merged;
}
export function toggleFavorite(owner: string, id: string): SavedFood[] {
  const merged = readSavedFoods(owner).map(food => food.key === id ? { ...food, favorite: !food.favorite } : food);
  write(owner, merged); return merged;
}
export function forgetFood(owner: string, id: string): SavedFood[] {
  const merged = readSavedFoods(owner).filter(food => food.key !== id);
  write(owner, merged); return merged;
}
export function orderFoods(foods: SavedFood[], tab: 'recent' | 'frequent' | 'favorite') {
  const list = tab === 'favorite' ? foods.filter(food => food.favorite) : [...foods];
  if (tab === 'frequent') return list.sort((a, b) => b.uses - a.uses || b.lastUsedMs - a.lastUsedMs);
  return list.sort((a, b) => b.lastUsedMs - a.lastUsedMs);
}
