import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { Reveal } from '../../theme/motion';
import { LoadingCards } from '../../components/LoadingCards';
import { haptic } from '../../theme/haptics';
import { useAuthStore } from '../../store/authStore';
import { useNutritionStore, nutritionStore, localDateKey } from '../../store/nutritionStore';
import { loadEntriesForRange, loadHistory, type HistoryDay } from '../../api/history';
import { MEAL_LABELS, MEAL_SLOTS } from '../../types/foodEntry';
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const pad = (value: number) => String(value).padStart(2, '0');
const keyFor = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
/** Monday-first offset for the 1st of the month. */
const leadingBlanks = (year: number, month: number) => (new Date(year, month, 1).getDay() + 6) % 7;
export default function CalendarScreen() {
  const owner = useAuthStore(s => s.session?.user.id);
  const target = useNutritionStore(s => s.dailyTargets?.macros.caloriesKcal ?? null);
  const today = localDateKey(new Date());
  const [cursor, setCursor] = useState(() => { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() }; });
  const [selected, setSelected] = useState<string | null>(today);
  const days = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const from = keyFor(cursor.year, cursor.month, 1);
  const to = keyFor(cursor.year, cursor.month, days);
  const history = useQuery({ enabled: !!owner, queryKey: ['history-range', owner, from, to], queryFn: () => loadHistory(owner!, from, to), staleTime: 120000 });
  const entries = useQuery({ enabled: !!owner, queryKey: ['history-entries-range', owner, from, to], queryFn: () => loadEntriesForRange(owner!, from, to), staleTime: 120000 });
  const byDate = useMemo(() => new Map((history.data ?? []).map(day => [day.log_date, day])), [history.data]);
  const move = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() }); setSelected(null); haptic('selection');
  };
  const label = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const chosen = selected ? byDate.get(selected) ?? null : null;
  const chosenEntries = selected ? entries.data?.[selected] ?? [] : [];
  const future = (date: string) => date > today;
  const copyDay = () => {
    if (!chosenEntries.length) return;
    for (const entry of chosenEntries) nutritionStore.getState().addEntry({ name: entry.name, meal: entry.meal, servings: entry.servings,
      servingLabel: entry.servingLabel, referenceMacros: entry.referenceMacros, referenceMicros: entry.referenceMicros, source: entry.source });
    haptic('success');
  };
  return <SafeAreaView edges={['left','right']} className="flex-1 bg-background">
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <Reveal index={0}>
        <View className="mb-4 flex-row items-center justify-between">
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" weight="subtle" onPress={() => move(-1)}
            className="h-12 w-12 items-center justify-center rounded-full bg-surface"><Text className="text-xl font-bold">‹</Text></Pressable>
          <Text className="text-xl font-bold">{label}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next month" weight="subtle" onPress={() => move(1)}
            className="h-12 w-12 items-center justify-center rounded-full bg-surface"><Text className="text-xl font-bold">›</Text></Pressable>
        </View>
      </Reveal>
      {history.isPending && <LoadingCards label="Loading your month…" />}
      {history.isError && <Text className="mb-4">Your history could not be loaded. Try again when connected.</Text>}
      <Reveal index={1}>
        <View className="flex-row">{WEEK.map((day, index) => <View key={index} style={{ flex: 1 }} className="items-center pb-2"><Text className="text-xs">{day}</Text></View>)}</View>
        <View className="flex-row flex-wrap">
          {Array.from({ length: leadingBlanks(cursor.year, cursor.month) }, (_, i) => <View key={`blank-${i}`} style={{ width: `${100 / 7}%` }} className="p-1" />)}
          {Array.from({ length: days }, (_, i) => {
            const date = keyFor(cursor.year, cursor.month, i + 1);
            const day = byDate.get(date);
            const logged = day?.calories_kcal != null && day.calories_kcal > 0;
            const over = logged && target !== null && day!.calories_kcal! > target * 1.05;
            const isToday = date === today;
            const isSelected = date === selected;
            return <View key={date} style={{ width: `${100 / 7}%` }} className="p-1">
              <Pressable accessibilityRole="button" accessibilityLabel={`${date}${logged ? `, ${Math.round(day!.calories_kcal!)} kcal` : ', nothing logged'}`}
                accessibilityState={{ selected: isSelected }} disabled={future(date)} weight="firm"
                onPress={() => { setSelected(date); haptic('selection'); }}
                className={`items-center rounded-xl py-2 ${isSelected ? 'bg-accent' : logged ? 'bg-surface' : 'bg-raised'}`}
                style={future(date) ? { opacity: .3 } : undefined}>
                <Text className={isToday ? 'font-bold underline' : logged ? 'font-bold' : ''}>{i + 1}</Text>
                <Text className="text-[10px]" style={{ opacity: logged ? 1 : .35 }}>{logged ? (over ? '▲' : '●') : '·'}</Text>
              </Pressable>
            </View>;
          })}
        </View>
      </Reveal>
      <Reveal index={2}>
        <View className="mt-5 rounded-3xl border border-border bg-surface p-5">
          {!selected && <Text>Pick a day to see what you ate.</Text>}
          {selected && <>
            <Text className="text-sm font-bold tracking-widest">{selected === today ? 'TODAY' : selected.toUpperCase()}</Text>
            {!chosen?.calories_kcal && <Text className="mt-2">Nothing was logged on this day.</Text>}
            {!!chosen?.calories_kcal && <>
              <Text className="my-2 text-4xl font-bold">{Math.round(chosen.calories_kcal)} kcal</Text>
              <Text>Protein {Math.round(chosen.proteinG ?? 0)} g · Carbs {Math.round(chosen.carbsG ?? 0)} g · Fat {Math.round(chosen.fatG ?? 0)} g</Text>
              {chosen.body_weight_lbs !== null && <Text className="mt-1 text-sm">Weighed {Number(chosen.body_weight_lbs.toFixed(1))} lbs</Text>}
              {target !== null && <Text className="mt-1 text-sm">{chosen.calories_kcal > target ? `${Math.round(chosen.calories_kcal - target)} kcal above` : `${Math.round(target - chosen.calories_kcal)} kcal below`} your current target.</Text>}
            </>}
            {MEAL_SLOTS.filter(slot => chosenEntries.some(entry => entry.meal === slot)).map(slot => <View key={slot} className="mt-3">
              <Text className="text-sm font-bold">{MEAL_LABELS[slot]}</Text>
              {chosenEntries.filter(entry => entry.meal === slot).map(entry => <Text key={entry.id} className="text-sm">· {entry.name} — {Math.round(entry.macros.caloriesKcal)} kcal</Text>)}
            </View>)}
            {!!chosenEntries.length && selected !== today && <Pressable accessibilityRole="button" accessibilityLabel="Copy this day into today"
              onPress={copyDay} className="mt-4 items-center rounded-xl bg-raised p-3"><Text className="font-bold">Copy this day into today</Text></Pressable>}
          </>}
        </View>
      </Reveal>
    </ScrollView>
  </SafeAreaView>;
}
