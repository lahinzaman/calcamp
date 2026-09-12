import { Dropdown } from '../../components/Dropdown';
import { servingLabel } from './serving';
import { rescueCatalog } from '../../data/rescueCatalog';
import { NUTRIENT_UNITS, type NutrientKey } from '../../types/nutrition';
import { foodEmoji } from './foodEmoji';
import { MacroOverview } from '../../components/MacroOverview';
import { safelyEdit } from '../../components/safelyEdit';
import { LoadingCards } from '../../components/LoadingCards';
import MacroRescue from './MacroRescue';
import { CloudDiaryControls } from '../../components/CloudDiaryControls';
import { useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { memo, useEffect, useMemo, useState } from 'react';
import { Linking, AppState, KeyboardAvoidingView, Platform, Modal, ScrollView, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { Text, TextInput } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';

import { fetchDailyMenu, normalizeMenuDate, NutrisliceError } from '../../api/nutrislice';
import { DINING_HALLS, type DiningHallSlug } from '../../types/campus';
import { MEAL_TYPES, type DailyMenuItem } from '../../types/nutrislice';
import type { MealSlot } from '../../types/foodEntry';
import type { MacroTotals } from '../../types/nutrition';
import { nutritionStore, useNutritionStore } from '../../store/nutritionStore';
import { foodLogAmounts } from './logFood';
import { MenuControls } from './MenuControls';
import { EMPTY_FILTERS, filterMenu, groupByStation, proteinDensity, stationsOf, type MenuFilterState } from './menuFilters';
import { FoodSearchModal } from '../foods/FoodSearchModal';

const HALL_LABELS: Record<DiningHallSlug, string> = {
  'busch-dining-hall': 'Busch', 'livingston-dining-commons': 'Livingston', 'the-atrium': 'Atrium', 'neilson-dining-hall': 'Neilson',
};
const display = (value: number | null) => value === null ? '—' : Number(value.toFixed(1)).toString();
const macroFields = [['caloriesKcal', 'Calories · kcal'], ['proteinG', 'Protein · g'], ['carbsG', 'Carbs · g'], ['fatG', 'Fats · g']] as const;

export function FoodLogSheet({ item, onClose, onLogged, meal }: {
  item: Pick<DailyMenuItem, 'id'|'name'|'serving'|'macros'|'nutrients'>; onClose: () => void; onLogged: (name: string) => void; meal?: MealSlot;
}) {
  const [servings, setServings] = useState('1');
  const [fields, setFields] = useState(() => Object.fromEntries(macroFields.map(([key]) => [key, item.macros[key]?.toString() ?? ''])) as Record<keyof MacroTotals, string>);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    try {
      if (!servings.trim() || macroFields.some(([key]) => !fields[key].trim())) throw new Error('Fill in servings and all four macro values. Unknown values are not zero.');
      const macros = Object.fromEntries(macroFields.map(([key]) => [key, Number(fields[key])])) as unknown as MacroTotals;
      // Reference values are per single serving so the portion stays editable in the diary.
      const single = foodLogAmounts(item, 1, macros);
      nutritionStore.getState().addEntry({ name: item.name, meal, servings: Number(servings), servingLabel: servingLabel(item.serving),
        referenceMacros: single.macros, referenceMicros: single.micros, source: 'dining' });
      onLogged(item.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your portion and macros.'); }
  };
  return (
    <Modal presentationStyle="pageSheet" animationType="slide" visible onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-surface"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="mx-auto w-full max-w-xl rounded-t-3xl bg-surface px-6 pb-12 pt-6" style={{ flex: 1 }}>
          <Text className="text-xs font-bold uppercase tracking-widest text-ink">Add to today's diary</Text>
          <Text className="mt-2 text-2xl font-bold text-ink">{item.name}</Text>
          <View className="mt-5 rounded-2xl bg-raised p-4"><Text className="mb-2 font-bold">Serving Size</Text><Text className="text-3xl font-bold">{servingLabel(item.serving)}</Text></View>
          <Text className="mt-3">Confirm or adjust the values per serving.</Text>
          <Text className="mb-2 mt-5 font-semibold text-ink">Number of servings</Text>
          <TextInput accessibilityLabel="Number of servings" keyboardType="decimal-pad" value={servings} onChangeText={setServings} className="rounded-xl border border-border bg-background p-4 text-3xl font-bold text-ink" />
          <View className="mt-4 flex-row flex-wrap gap-3">
            {macroFields.map(([key, label]) => (
              <View key={key} style={{ flexGrow: 1, flexBasis: 140 }}>
                <Text className="mb-2 text-sm font-medium text-ink">{label}</Text>
                <TextInput accessibilityLabel={label} keyboardType="decimal-pad" placeholder="Required" value={fields[key]} onChangeText={(value) => setFields((current) => ({ ...current, [key]: value }))} className="rounded-xl border border-border bg-background p-4 text-2xl font-bold text-ink" />
              </View>
            ))}
          </View>
          <View className="mt-5 rounded-2xl bg-raised p-4"><Text className="mb-3 text-lg font-bold">Other nutrients · per listed serving</Text>
            {Object.entries(foodLogAmounts(item, 1, {caloriesKcal:0,proteinG:0,carbsG:0,fatG:0}).micros).map(([key,value]) => <View key={key} className="mb-2 flex-row justify-between gap-4"><Text className="flex-1 capitalize">{key.replace(/_(g|mg|mcg)$/, '').replaceAll('_',' ')}</Text><Text>{display(value)} {NUTRIENT_UNITS[key as NutrientKey]}</Text></View>)}
            {!Object.keys(item.nutrients).length && <Text>Micronutrients not reported. Missing values are not zero.</Text>}
          </View>
          {error && <Text accessibilityRole="alert" className="mt-4 text-sm text-ink">{error}</Text>}
          <Pressable accessibilityRole="button" onPress={save} className="mt-6 items-center rounded-2xl bg-accent p-4 active:opacity-80"><Text className="font-bold text-ink">Confirm log</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} className="mt-2 items-center p-4"><Text className="font-semibold text-ink">Cancel</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView></SafeAreaView>
    </Modal>
  );
}

export default function DiningHallScreen() {
  const hall = useNutritionStore((state) => state.activeDiningHall) ?? 'busch-dining-hall';
  const [period,setPeriod] = useState<'breakfast'|'lunch'|'dinner'|'takeout'>('lunch');
  const [date, setDate] = useState(() => normalizeMenuDate(new Date()));
  const [selected, setSelected] = useState<DailyMenuItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filters, setFilters] = useState<MenuFilterState>(EMPTY_FILTERS);
  const [searchingFoods, setSearchingFoods] = useState(false);
  const consumed = useNutritionStore(state => state.consumedMacros.caloriesKcal);
  const calorieTarget = useNutritionStore(state => state.dailyTargets?.macros.caloriesKcal ?? null);
  const remainingKcal = calorieTarget === null ? null : Math.max(0, calorieTarget - consumed);
  useEffect(() => {
    if (nutritionStore.getState().activeDiningHall === null) nutritionStore.getState().setActiveDiningHall('busch-dining-hall');
    const update = () => { setDate(normalizeMenuDate(new Date())); safelyEdit(() => nutritionStore.getState().syncToday()); };
    const id = setInterval(update, 60_000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') update(); });
    return () => { clearInterval(id); listener.remove(); };
  }, []);
  useEffect(() => { setSelected(null); setNotice(null); setFilters(EMPTY_FILTERS); }, [hall, date, period]);
  const menu = useQuery({
    enabled: period !== 'takeout',
    queryKey: ['nutrislice', hall, date],
    queryFn: ({ signal }) => fetchDailyMenu(hall, date, {
      signal, fallbackBaseUrl: process.env.EXPO_PUBLIC_NUTRISLICE_PROXY_URL || process.env.EXPO_PUBLIC_BACKEND_URL || undefined,
    }),
  });
  const mealFoods = useMemo(() => menu.isPending || (menu.isError && !menu.data) ? []
    : (menu.data ?? []).filter(item => MEAL_TYPES.some(meal => meal === period && item.meal === meal)), [menu.data, menu.isPending, menu.isError, period]);
  const stations = useMemo(() => stationsOf(mealFoods), [mealFoods]);
  const matches = useMemo(() => filterMenu(mealFoods, filters, remainingKcal), [mealFoods, filters, remainingKcal]);
  const rows = useMemo<DiningRow[]>(() => {
    if (!mealFoods.length) return menu.isPending || menu.isError ? [] : [{ kind: 'empty', id: `empty:${period}` }];
    if (!matches.length) return [{ kind: 'none', id: 'none' }];
    // Grouping is the default because that is how the hall is physically laid out; any other
    // sort is a deliberate question ("most protein"), and grouping would fight the answer.
    if (filters.sort !== 'station') return matches.map(food => ({ kind: 'food' as const, id: `${period}:${food.id}`, food }));
    return groupByStation(matches).flatMap(group => [
      { kind: 'station' as const, id: `station:${group.station}`, station: group.station, count: group.items.length },
      ...group.items.map(food => ({ kind: 'food' as const, id: `${period}:${food.id}`, food })),
    ]);
  }, [mealFoods, matches, filters.sort, menu.isPending, menu.isError, period]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background">
      <FlashList
        data={rows} keyExtractor={(item) => item.id} getItemType={item => item.kind}
        contentContainerStyle={{ padding: 20, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' }}
        refreshing={menu.isRefetching} onRefresh={() => { void menu.refetch(); }}
        ListFooterComponent={period === 'takeout' ? TakeoutCatalog : undefined}
        ListHeaderComponent={<>
          {period !== 'takeout' && menu.isPending && <LoadingCards label="Loading campus menus…" />}
          {period !== 'takeout' && menu.data?.some(item => item.dataFreshness === 'stale') && <Text className="mb-4 rounded-xl bg-raised p-3 text-ink">Showing a saved menu while Rutgers is unavailable. Confirm current portions and availability.</Text>}
          <View className="mb-6 flex-row items-center justify-between"><Text className="text-sm font-black tracking-widest text-ink">CALCAMP</Text><Text className="text-xs font-semibold text-ink">NEW BRUNSWICK</Text></View>
          <Text className="text-4xl font-bold tracking-tight text-ink">Campus dining</Text>
          <Text className="mt-2 text-base text-ink">Your campus. Your plate. Your goals.</Text>
          <MacroOverview />
          <CloudDiaryControls />
          <Dropdown label="Meal period" value={period} options={[{value:'breakfast',label:'Breakfast'},{value:'lunch',label:'Lunch'},{value:'dinner',label:'Dinner'},{value:'takeout',label:'Takeout'}] as const} onChange={value=>{setSelected(null);setPeriod(value);}} />
          {period !== 'takeout' && <Dropdown key={period} label="Dining hall" value={hall} options={(Object.keys(DINING_HALLS) as DiningHallSlug[]).map(value=>({value,label:DINING_HALLS[value]}))} onChange={value=>nutritionStore.getState().setActiveDiningHall(value)} />}
          <Text className="mb-3 text-sm text-ink">{period === 'takeout' ? 'Published takeout references' : DINING_HALLS[hall]} · Nutrition per listed serving</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Add a saved food or recipe" onPress={() => setSearchingFoods(true)}
            className="mb-4 min-h-12 flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
            <Text className="flex-1 font-bold text-ink">Saved foods, recipes & food database</Text><Text className="text-ink">＋</Text>
          </Pressable>
          {period !== 'takeout' && !!menu.data?.length && <MenuControls filters={filters} onChange={setFilters} stations={stations}
            shown={matches.length} total={mealFoods.length} remainingKcal={remainingKcal} />}
          {notice && <Text accessibilityRole="alert" className="mb-3 rounded-xl bg-raised p-3 text-sm text-ink">{notice}</Text>}

          {period !== 'takeout' && menu.error instanceof NutrisliceError && !!menu.error.fallbackMeals?.length && <View className="mb-4 rounded-2xl bg-raised p-4">
            <Text className="font-bold text-ink">Published takeout alternatives</Text>
            <Text className="mt-2 text-sm text-ink">Campus menus are unavailable. These catalog meals are reference options; opening hours, availability and current portions have not been verified.</Text>
            {menu.error.fallbackMeals.map(meal => <View key={meal.id} className="mt-3"><Text className="font-semibold">{meal.name}</Text><Text className="mt-1 text-sm">{meal.macros.caloriesKcal} kcal · P {meal.macros.proteinG}g · C {meal.macros.carbsG}g · F {meal.macros.fatG}g</Text><Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(meal.sourceUrl).catch(() => setNotice('Unable to open nutrition source. Try again when connected.')); }}><Text className="mt-2 text-sm underline">Nutrition source · reviewed {meal.reviewedAt}</Text></Pressable></View>)}
          </View>}
          {period !== 'takeout' && menu.isError && <View className="rounded-2xl bg-raised p-4"><Text accessibilityRole="alert" className="font-semibold text-ink">Menu unavailable</Text><Text className="mt-1 text-sm text-ink">{menu.data ? 'Showing the last loaded menu. Pull to refresh.' : 'We could not reach campus dining. Please try again.'}</Text><Pressable accessibilityRole="button" onPress={() => { void menu.refetch(); }} className="mt-3 py-2"><Text className="font-bold text-ink">Retry menu</Text></Pressable></View>}
        </>}
        renderItem={({ item }) => item.kind === 'food' ? <FoodRow item={item.food} onSelect={setSelected} />
          : item.kind === 'empty' ? <Text className="mb-3 text-sm text-ink">No menu published for this meal.</Text>
          : item.kind === 'none' ? <Text className="mb-3 text-sm text-ink">Nothing on this menu matches. Clear a filter, or search for a shorter word.</Text>
          : <View className="mb-3 mt-6 flex-row items-end justify-between gap-3">
              <Text className="flex-1 text-xl font-bold text-ink">{item.station}</Text>
              <Text className="text-xs text-ink">{item.count} {item.count === 1 ? 'dish' : 'dishes'}</Text>
            </View>}
      />
      {searchingFoods && <FoodSearchModal onClose={() => setSearchingFoods(false)} />}
      {selected && <FoodLogSheet key={selected.id} item={selected} onClose={() => setSelected(null)} onLogged={(name) => { setSelected(null); setNotice(`${name} added to your diary.`); }} />}
    </SafeAreaView>
  );
}

 type DiningRow = { kind: 'station'; id: string; station: string; count: number } | { kind: 'empty'; id: string }
  | { kind: 'none'; id: string } | { kind: 'food'; id: string; food: DailyMenuItem };
const FoodRow = memo(function FoodRow({ item, onSelect }: { item: DailyMenuItem; onSelect: (item: DailyMenuItem) => void }) {
  const density = proteinDensity(item);
  return <View className="mb-3 rounded-2xl border border-border bg-surface p-4">
          <Pressable accessibilityRole="button" accessibilityLabel={`Food details for ${item.name}`} onPress={() => onSelect(item)} className="flex-row items-start gap-3"><Text accessibilityElementsHidden importantForAccessibility="no" className="text-3xl leading-[40px]">{foodEmoji(item.name)}</Text><Text className="flex-1 text-base font-semibold text-ink">{item.name}</Text></Pressable>
          <Text className="mt-1 text-xs text-ink">{servingLabel(item.serving)} · {display(item.macros.caloriesKcal)} kcal{density !== null ? ` · ${density.toFixed(1)} g protein per 100 kcal` : ''}</Text>
          <View className="mt-4 flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-xs font-medium text-ink" style={{ flexGrow: 1, flexBasis: 150 }}>P {display(item.macros.proteinG)}g   C {display(item.macros.carbsG)}g   F {display(item.macros.fatG)}g</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Log ${item.name} to diary`} onPress={() => onSelect(item)} className="min-h-12 justify-center rounded-xl bg-raised px-3 py-3 active:bg-raised"><Text className="text-xs font-bold text-ink">Log to Diary +</Text></Pressable>
          </View>
        </View>;
});

function TakeoutCatalog() {
  const [selected,setSelected]=useState<Parameters<typeof FoodLogSheet>[0]['item']|null>(null);
  const [notice,setNotice]=useState('');
  return <View><Text className="mb-3">Standard portions from published menus. Availability and opening hours are not verified here.</Text>
    {rescueCatalog.flatMap(group=>group.meals.map(meal=><View key={meal.id} className="mb-3 rounded-2xl bg-surface p-4"><Text className="font-bold">{meal.name}</Text><Text className="my-2">{meal.macros.caloriesKcal} kcal · P {meal.macros.proteinG} g · C {meal.macros.carbsG} g · F {meal.macros.fatG} g</Text><Pressable accessibilityRole="button" onPress={()=>setSelected({id:meal.id,name:meal.name,macros:meal.macros,nutrients:{},serving:{amount:8,unit:'oz',label:'8 oz total · two 4 oz ingredients'}})}><Text>Review portion & log</Text></Pressable><Pressable accessibilityRole="link" onPress={()=>{void Linking.openURL(meal.sourceUrl).catch(()=>setNotice('Nutrition source unavailable.'));}}><Text className="underline">Published nutrition · reviewed {meal.reviewedAt}</Text></Pressable></View>))}
    {!!notice&&<Text accessibilityRole="alert">{notice}</Text>}<MacroRescue/>
    {selected&&<FoodLogSheet item={selected} onClose={()=>setSelected(null)} onLogged={name=>{setSelected(null);setNotice(`${name} added to diary.`);}}/>}
  </View>;
}
