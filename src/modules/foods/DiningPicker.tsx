import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Choice, Field } from '../../components/FormControls';
import { LoadingCards } from '../../components/LoadingCards';
import { fetchDailyMenu, normalizeMenuDate } from '../../api/nutrislice';
import { DINING_HALLS, type DiningHallSlug } from '../../types/campus';
import { MEAL_TYPES, type DailyMenuItem, type MealType } from '../../types/nutrislice';
import { useNutritionStore } from '../../store/nutritionStore';
import { servingLabel } from '../dining/serving';
import { foodEmoji } from '../dining/foodEmoji';
import { FoodLogSheet } from '../dining/FoodLogSheet';
import { EMPTY_FILTERS, filterMenu, groupByStation } from '../dining/menuFilters';
import type { MealSlot } from '../../types/foodEntry';

const HALLS = Object.keys(DINING_HALLS) as DiningHallSlug[];
const MEAL_LABELS: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const kcal = (value: number | null) => value === null ? '—' : String(Math.round(value));

/**
 * Campus food from the + button. It is the same menu the Dining screen shows, narrowed to
 * what you are actually looking for, so logging a dining-hall meal never means leaving
 * whatever you were doing to go and find the menu.
 */
export function DiningPicker({ meal, onLogged }: { meal?: MealSlot; onLogged: (name: string) => void }) {
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

  return <>
    <View className="mb-3 flex-row flex-wrap">{HALLS.map(value => <Choice key={value} label={DINING_HALLS[value]}
      selected={hall === value} onPress={() => setHall(value)} />)}</View>
    <View className="mb-3 flex-row flex-wrap">{MEAL_TYPES.map(value => <Choice key={value} label={MEAL_LABELS[value]}
      selected={period === value} onPress={() => setPeriod(value)} />)}</View>
    <Field label="Search today's menu" value={query} onChangeText={setQuery} autoCorrect={false} placeholder="grilled chicken, rice, tofu…" />

    {menu.isPending && <LoadingCards label="Loading today's menu…" />}
    {menu.isError && <Text accessibilityRole="alert" className="mb-3">Campus menus are unavailable right now. Try again, or add this food by hand.</Text>}
    {!menu.isPending && !menu.isError && !total && <Text className="mb-3">
      {query.trim() ? `Nothing on today's ${MEAL_LABELS[period].toLowerCase()} menu matches “${query.trim()}”.` : `No ${MEAL_LABELS[period].toLowerCase()} menu is published for ${DINING_HALLS[hall]} today.`}
    </Text>}

    {groups.map(group => <View key={group.station} className="mb-4">
      <Text className="mb-2 text-sm font-bold tracking-widest">{group.station.toUpperCase()}</Text>
      {group.items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.name}
        onPress={() => setSelected(item)} weight="subtle" className="mb-2 flex-row items-center gap-3 rounded-2xl bg-surface px-4 py-3">
        <Text className="text-2xl">{foodEmoji(item.name)}</Text>
        <View className="flex-1">
          <Text className="font-bold">{item.name}</Text>
          <Text className="mt-0.5 text-sm">{kcal(item.macros.caloriesKcal)} kcal · P {kcal(item.macros.proteinG)} · {servingLabel(item.serving)}</Text>
        </View>
      </Pressable>)}
    </View>)}

    {selected && <FoodLogSheet key={selected.id} item={selected} meal={meal}
      onClose={() => setSelected(null)} onLogged={name => { setSelected(null); onLogged(name); }} />}
  </>;
}
