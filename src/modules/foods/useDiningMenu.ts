import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDailyMenu, normalizeMenuDate } from '../../api/nutrislice';
import { DINING_HALLS, type DiningHallSlug } from '../../types/campus';
import { type DailyMenuItem, type MealType } from '../../types/nutrislice';
import { useNutritionStore } from '../../store/nutritionStore';
import { EMPTY_FILTERS, filterMenu, groupByStation } from '../dining/menuFilters';

export const DINING_HALL_SLUGS = Object.keys(DINING_HALLS) as DiningHallSlug[];
export const MEAL_TYPE_LABELS: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

/**
 * The campus menu's state, separated from any way of drawing it. The picker used to own both,
 * which meant its station groups could only ever be rendered as one nested block — every item
 * mounted at once, inside whatever list was already scrolling. Handing the groups back lets the
 * caller flatten them into its own list and recycle them like any other row.
 */
export function useDiningMenu() {
  const activeHall = useNutritionStore(state => state.activeDiningHall);
  const [hall, setHall] = useState<DiningHallSlug>(activeHall ?? 'busch-dining-hall');
  const [period, setPeriod] = useState<MealType>('lunch');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<DailyMenuItem | null>(null);
  const date = useMemo(() => normalizeMenuDate(new Date()), []);
  const menu = useQuery({ queryKey: ['nutrislice', hall, date], staleTime: 300_000,
    queryFn: ({ signal }) => fetchDailyMenu(hall, date, { signal,
      fallbackBaseUrl: process.env.EXPO_PUBLIC_NUTRISLICE_PROXY_URL || process.env.EXPO_PUBLIC_BACKEND_URL || undefined }) });

  const groups = useMemo(() => {
    const foods = (menu.data ?? []).filter(item => item.meal === period);
    return groupByStation(filterMenu(foods, { ...EMPTY_FILTERS, query }, null));
  }, [menu.data, period, query]);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  /** The one-line reason there is nothing to show, or null when there is. */
  const emptyReason = menu.isPending || menu.isError || total ? null
    : query.trim()
      ? `Nothing on today's ${MEAL_TYPE_LABELS[period].toLowerCase()} menu matches “${query.trim()}”.`
      : `No ${MEAL_TYPE_LABELS[period].toLowerCase()} menu is published for ${DINING_HALLS[hall]} today.`;

  return { hall, setHall, period, setPeriod, query, setQuery, selected, setSelected,
    groups, total, emptyReason, isPending: menu.isPending, isError: menu.isError };
}
