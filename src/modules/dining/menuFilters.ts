import type { DailyMenuItem } from '../../types/nutrislice';

export type MenuSort = 'station' | 'protein' | 'calories-low' | 'calories-high' | 'protein-density' | 'name';
export const MENU_SORTS: [MenuSort, string][] = [
  ['station', 'By station'], ['protein', 'Most protein'], ['protein-density', 'Protein per calorie'],
  ['calories-low', 'Fewest calories'], ['calories-high', 'Most calories'], ['name', 'A–Z'],
];

export type QuickFilter = 'high-protein' | 'protein-dense' | 'light' | 'fits' | 'high-fiber' | 'low-carb' | 'low-sodium';
export const QUICK_FILTERS: [QuickFilter, string, string][] = [
  ['fits', 'Fits today', 'At or under the calories you have left'],
  ['high-protein', '20 g+ protein', 'At least 20 g of protein in the listed serving'],
  ['protein-dense', 'Protein per calorie', 'At least 10 g of protein per 100 kcal'],
  ['light', 'Under 250 kcal', 'A light portion you can build a plate around'],
  ['high-fiber', '3 g+ fibre', 'At least 3 g of fibre in the listed serving'],
  ['low-carb', 'Under 15 g carbs', 'At most 15 g of carbohydrate'],
  ['low-sodium', 'Under 400 mg sodium', 'At most 400 mg of sodium'],
];

export interface MenuFilterState {
  query: string; stations: string[]; quick: QuickFilter[]; sort: MenuSort;
}
export const EMPTY_FILTERS: MenuFilterState = { query: '', stations: [], quick: [], sort: 'station' };
export const activeMenuFilterCount = (filters: MenuFilterState) => filters.stations.length + filters.quick.length;

const nutrient = (item: DailyMenuItem, key: string) => {
  const value = item.nutrients[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
/** Grams of protein per 100 kcal — null when either half is unknown or the food is calorie-free. */
export function proteinDensity(item: DailyMenuItem): number | null {
  const { proteinG, caloriesKcal } = item.macros;
  if (proteinG === null || caloriesKcal === null || caloriesKcal <= 0) return null;
  return (proteinG / caloriesKcal) * 100;
}

/**
 * Unknown never passes a threshold. A dining hall that does not publish protein for a dish
 * must not have that dish show up under "20 g+ protein" — absent is not zero.
 */
function passes(item: DailyMenuItem, filter: QuickFilter, remainingKcal: number | null): boolean {
  switch (filter) {
    case 'fits': return remainingKcal !== null && item.macros.caloriesKcal !== null && item.macros.caloriesKcal <= remainingKcal;
    case 'high-protein': return item.macros.proteinG !== null && item.macros.proteinG >= 20;
    case 'protein-dense': { const density = proteinDensity(item); return density !== null && density >= 10; }
    case 'light': return item.macros.caloriesKcal !== null && item.macros.caloriesKcal <= 250;
    case 'high-fiber': { const fiber = nutrient(item, 'g_fiber'); return fiber !== null && fiber >= 3; }
    case 'low-carb': return item.macros.carbsG !== null && item.macros.carbsG <= 15;
    case 'low-sodium': { const sodium = nutrient(item, 'mg_sodium'); return sodium !== null && sodium <= 400; }
  }
}

/** Sorts push unknown values to the end rather than treating them as zero. */
function compare(sort: MenuSort, a: DailyMenuItem, b: DailyMenuItem): number {
  const rank = (value: number | null, descending: boolean) => value === null ? Infinity : descending ? -value : value;
  switch (sort) {
    case 'protein': return rank(a.macros.proteinG, true) - rank(b.macros.proteinG, true);
    case 'protein-density': return rank(proteinDensity(a), true) - rank(proteinDensity(b), true);
    case 'calories-low': return rank(a.macros.caloriesKcal, false) - rank(b.macros.caloriesKcal, false);
    case 'calories-high': return rank(a.macros.caloriesKcal, true) - rank(b.macros.caloriesKcal, true);
    default: return 0;
  }
}

export function filterMenu(items: readonly DailyMenuItem[], filters: MenuFilterState, remainingKcal: number | null): DailyMenuItem[] {
  const terms = filters.query.toLowerCase().split(/\s+/).filter(Boolean);
  const matched = items.filter(item => {
    if (filters.stations.length && !filters.stations.includes(item.station ?? '')) return false;
    if (!filters.quick.every(filter => passes(item, filter, remainingKcal))) return false;
    if (!terms.length) return true;
    const text = `${item.name} ${item.station ?? ''}`.toLowerCase();
    return terms.every(term => text.includes(term));
  });
  if (filters.sort === 'station') return matched;
  if (filters.sort === 'name') return [...matched].sort((a, b) => a.name.localeCompare(b.name));
  // A stable secondary key keeps equal rows from shuffling between renders.
  return [...matched].sort((a, b) => compare(filters.sort, a, b) || a.name.localeCompare(b.name));
}

export interface StationGroup { station: string; items: DailyMenuItem[] }
/** Stations keep the order the hall published them in, not alphabetical order. */
export function groupByStation(items: readonly DailyMenuItem[]): StationGroup[] {
  const groups: StationGroup[] = [];
  const index = new Map<string, StationGroup>();
  for (const item of items) {
    const station = item.station ?? 'Everything else';
    let group = index.get(station);
    if (!group) { group = { station, items: [] }; index.set(station, group); groups.push(group); }
    group.items.push(item);
  }
  return groups;
}
export const stationsOf = (items: readonly DailyMenuItem[]) =>
  [...new Set(items.map(item => item.station).filter((station): station is string => !!station))];
