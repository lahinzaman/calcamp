import MacroRescue from './MacroRescue';
import { CloudDiaryControls } from '../../components/CloudDiaryControls';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, SectionList, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchDailyMenu, normalizeMenuDate } from '../../api/nutrislice';
import { DINING_HALLS, type DiningHallSlug } from '../../types/campus';
import { MEAL_TYPES, type DailyMenuItem } from '../../types/nutrislice';
import type { MacroTotals } from '../../types/nutrition';
import { nutritionStore, useNutritionStore } from '../../store/nutritionStore';
import { foodLogAmounts } from './logFood';

const HALL_LABELS: Record<DiningHallSlug, string> = {
  'busch-dining-hall': 'Busch', 'livingston-dining-commons': 'Livingston', 'the-atrium': 'Atrium', 'neilson-dining-hall': 'Neilson',
};
const display = (value: number | null) => value === null ? '—' : Number(value.toFixed(1)).toString();
const macroFields = [['caloriesKcal', 'Calories · kcal'], ['proteinG', 'Protein · g'], ['carbsG', 'Carbs · g'], ['fatG', 'Fats · g']] as const;

export function FoodLogSheet({ item, onClose, onLogged }: {
  item: DailyMenuItem; onClose: () => void; onLogged: (name: string) => void;
}) {
  const [servings, setServings] = useState('1');
  const [fields, setFields] = useState(() => Object.fromEntries(macroFields.map(([key]) => [key, item.macros[key]?.toString() ?? ''])) as Record<keyof MacroTotals, string>);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    try {
      if (!servings.trim() || macroFields.some(([key]) => !fields[key].trim())) throw new Error('Fill in servings and all four macro values. Unknown values are not zero.');
      const macros = Object.fromEntries(macroFields.map(([key]) => [key, Number(fields[key])])) as unknown as MacroTotals;
      const totals = foodLogAmounts(item, Number(servings), macros);
      nutritionStore.getState().addConsumed(totals.macros, totals.micros);
      onLogged(item.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your portion and macros.'); }
  };
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="mx-auto w-full max-w-xl rounded-t-3xl bg-white px-6 pb-12 pt-6" style={{ maxHeight: '90%' }}>
          <Text className="text-xs font-bold uppercase tracking-widest text-scarlet">Add to today's diary</Text>
          <Text className="mt-2 text-2xl font-bold text-zinc-950">{item.name}</Text>
          <Text className="mt-2 text-sm text-zinc-500">{item.serving.label ?? 'One listed serving'} · Confirm or adjust the values per serving.</Text>
          <Text className="mb-2 mt-5 font-semibold text-zinc-700">Number of servings</Text>
          <TextInput accessibilityLabel="Number of servings" keyboardType="decimal-pad" value={servings} onChangeText={setServings} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-lg text-zinc-950" />
          <View className="mt-4 flex-row flex-wrap gap-3">
            {macroFields.map(([key, label]) => (
              <View key={key} style={{ width: '46%' }}>
                <Text className="mb-2 text-sm font-medium text-zinc-600">{label}</Text>
                <TextInput accessibilityLabel={label} keyboardType="decimal-pad" placeholder="Required" value={fields[key]} onChangeText={(value) => setFields((current) => ({ ...current, [key]: value }))} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-lg text-zinc-950" />
              </View>
            ))}
          </View>
          {error && <Text accessibilityRole="alert" className="mt-4 text-sm text-red-700">{error}</Text>}
          <Pressable accessibilityRole="button" onPress={save} className="mt-6 items-center rounded-2xl bg-scarlet p-4 active:opacity-80"><Text className="font-bold text-white">Confirm log</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} className="mt-2 items-center p-4"><Text className="font-semibold text-zinc-600">Cancel</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function DiningHallScreen() {
  const hall = useNutritionStore((state) => state.activeDiningHall) ?? 'busch-dining-hall';
  const consumed = useNutritionStore((state) => state.consumedMacros);
  const targets = useNutritionStore((state) => state.dailyTargets);
  const [date, setDate] = useState(() => normalizeMenuDate(new Date()));
  const [selected, setSelected] = useState<DailyMenuItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (nutritionStore.getState().activeDiningHall === null) nutritionStore.getState().setActiveDiningHall('busch-dining-hall');
    const update = () => { setDate(normalizeMenuDate(new Date())); nutritionStore.getState().syncToday(); };
    const id = setInterval(update, 60_000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') update(); });
    return () => { clearInterval(id); listener.remove(); };
  }, []);
  useEffect(() => { setSelected(null); setNotice(null); }, [hall, date]);
  const menu = useQuery({
    queryKey: ['nutrislice', hall, date],
    queryFn: ({ signal }) => fetchDailyMenu(hall, date, {
      signal, fallbackBaseUrl: process.env.EXPO_PUBLIC_NUTRISLICE_PROXY_URL || undefined,
    }),
  });
  const sections = MEAL_TYPES.map((meal) => ({ title: meal, data: (menu.data ?? []).filter((item) => item.meal === meal) }));

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-[#F7F7F2]">
      <SectionList
        sections={sections} keyExtractor={(item) => item.id} stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center' }}
        initialNumToRender={8} refreshing={menu.isRefetching} onRefresh={() => { void menu.refetch(); }}
        ListFooterComponent={<MacroRescue />}
        ListHeaderComponent={<>
          <View className="mb-6 flex-row items-center justify-between"><Text className="text-sm font-black tracking-widest text-scarlet">RULOCKED</Text><Text className="text-xs font-semibold text-zinc-500">NEW BRUNSWICK</Text></View>
          <Text className="text-4xl font-bold tracking-tight text-zinc-950">Campus dining</Text>
          <Text className="mt-2 text-base text-zinc-500">Your campus. Your plate. Your goals.</Text>
          <View className="my-6 rounded-3xl bg-zinc-950 p-5">
            <View className="flex-row items-center justify-between"><Text className="text-xs font-bold uppercase tracking-widest text-zinc-400">Today's diary</Text><Text className="text-xs text-zinc-400">{date}</Text></View>
            <View className="mt-3 flex-row items-baseline gap-2"><Text testID="consumed-calories" className="text-4xl font-bold text-white">{Math.round(consumed.caloriesKcal)}</Text><Text className="text-sm text-zinc-400">{targets ? `/ ${targets.macros.caloriesKcal} kcal` : 'kcal logged'}</Text></View>
            <View className="mt-5 flex-row justify-between border-t border-zinc-700 pt-4">
              {([['Protein', consumed.proteinG], ['Carbs', consumed.carbsG], ['Fats', consumed.fatG]] as const).map(([label, value]) => <View key={label}><Text className="text-xs text-zinc-400">{label}</Text><Text className="mt-1 text-lg font-semibold text-white">{display(value)} g</Text></View>)}
            </View>
          </View>
          <CloudDiaryControls />
          <View className="mb-4 flex-row gap-2">
            {(Object.keys(DINING_HALLS) as DiningHallSlug[]).map((slug) => <Pressable key={slug} accessibilityRole="tab" accessibilityLabel={DINING_HALLS[slug]} accessibilityState={{ selected: slug === hall }} onPress={() => nutritionStore.getState().setActiveDiningHall(slug)} className={slug === hall ? 'flex-1 items-center rounded-xl bg-scarlet py-3' : 'flex-1 items-center rounded-xl bg-white py-3'}><Text className={slug === hall ? 'text-xs font-bold text-white' : 'text-xs font-semibold text-zinc-600'}>{HALL_LABELS[slug]}</Text></Pressable>)}
          </View>
          <Text className="mb-3 text-sm text-zinc-500">{DINING_HALLS[hall]} · Nutrition per listed serving</Text>
          {notice && <Text accessibilityRole="alert" className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</Text>}
          {menu.isPending && <View className="items-center py-8"><ActivityIndicator color="#CC0033" /><Text className="mt-3 text-zinc-500">Loading campus menus…</Text></View>}
          {menu.isError && <View className="rounded-2xl bg-red-50 p-4"><Text accessibilityRole="alert" className="font-semibold text-red-800">Menu unavailable</Text><Text className="mt-1 text-sm text-red-700">{menu.data ? 'Showing the last loaded menu. Pull to refresh.' : 'We could not reach campus dining. Please try again.'}</Text><Pressable accessibilityRole="button" onPress={() => { void menu.refetch(); }} className="mt-3 py-2"><Text className="font-bold text-red-800">Retry menu</Text></Pressable></View>}
        </>}
        renderSectionHeader={({ section }) => menu.isPending || (menu.isError && !menu.data) ? null : <View className="mb-3 mt-6 flex-row items-center justify-between"><Text className="text-2xl font-bold capitalize text-zinc-950">{section.title}</Text><Text className="text-xs text-zinc-500">{section.data.length} items</Text></View>}
        renderSectionFooter={({ section }) => !menu.isPending && !menu.isError && section.data.length === 0 ? <Text className="mb-3 text-sm text-zinc-500">No menu published for this meal.</Text> : null}
        renderItem={({ item }) => <View className="mb-3 rounded-2xl border border-zinc-100 bg-white p-4">
          <Text className="text-base font-semibold text-zinc-900">{item.name}</Text>
          <Text className="mt-1 text-xs text-zinc-500">{item.serving.label ?? 'Serving size not listed'} · {display(item.macros.caloriesKcal)} kcal</Text>
          <View className="mt-4 flex-row items-center justify-between gap-2"><Text className="flex-1 text-xs font-medium text-zinc-600">P {display(item.macros.proteinG)}g   C {display(item.macros.carbsG)}g   F {display(item.macros.fatG)}g</Text><Pressable accessibilityRole="button" accessibilityLabel={`Log ${item.name} to diary`} onPress={() => setSelected(item)} className="rounded-xl bg-zinc-100 px-3 py-3 active:bg-zinc-200"><Text className="text-xs font-bold text-zinc-900">Log to Diary +</Text></Pressable></View>
        </View>}
      />
      {selected && <FoodLogSheet key={selected.id} item={selected} onClose={() => setSelected(null)} onLogged={(name) => { setSelected(null); setNotice(`${name} added to your diary.`); }} />}
    </SafeAreaView>
  );
}
