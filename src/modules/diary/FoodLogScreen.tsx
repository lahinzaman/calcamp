import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { Reveal } from '../../theme/motion';
import { LoadingCards } from '../../components/LoadingCards';
import { Choice } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { useAuthStore } from '../../store/authStore';
import { localDateKey, nutritionStore, useNutritionStore } from '../../store/nutritionStore';
import { loadEntriesForRange, loadHistory } from '../../api/history';
import { MEAL_LABELS, MEAL_SLOTS, SOURCE_LABELS, type FoodEntry } from '../../types/foodEntry';
import { foodEmoji } from '../dining/foodEmoji';
import { FoodSearchModal } from '../foods/FoodSearchModal';
import { EntryEditor } from './EntryEditor';
import {
  PERFECT_WINDOW_KCAL, addDays, dayLabel, dayOfMonth, dayStatus, dateKey,
  perfectDays, shortWeekday, timeOfDay, weekDates,
} from './logCalendar';

const MARK_TONE: Record<string, string> = { perfect: 'bg-accent', over: 'bg-raised', under: 'bg-raised', logged: 'bg-surface', none: 'bg-raised' };
const monthStart = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}-01`;
const leadingBlanks = (year: number, month: number) => (new Date(year, month, 1).getDay() + 6) % 7;

function EntryLine({ entry, onEdit }: { entry: FoodEntry; onEdit?: (entry: FoodEntry) => void }) {
  const body = <View className="flex-row items-start gap-3">
    <Text className="text-2xl">{foodEmoji(entry.name)}</Text>
    <View className="flex-1">
      <Text className="font-bold">{entry.name}</Text>
      <Text className="text-sm">{timeOfDay(entry.loggedAtMs)} · {Number(entry.servings.toFixed(2))} × {entry.servingLabel ?? 'serving'} · {SOURCE_LABELS[entry.source]}</Text>
      <Text className="text-sm">P {Math.round(entry.macros.proteinG)} g · C {Math.round(entry.macros.carbsG)} g · F {Math.round(entry.macros.fatG)} g</Text>
    </View>
    <Text className="text-lg font-bold" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(entry.macros.caloriesKcal)}</Text>
  </View>;
  if (!onEdit) return <View className="mb-2 rounded-2xl bg-raised px-4 py-3">{body}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${entry.name}`} onPress={() => onEdit(entry)} weight="subtle"
    className="mb-2 rounded-2xl bg-raised px-4 py-3">{body}</Pressable>;
}

/**
 * The food log is the diary as a place you can move around in: a week of days across the
 * top, a month view for the longer pattern, and every entry stamped with the time it was
 * logged. Today stays live from the store; past days come from the cloud diary.
 */
export default function FoodLogScreen() {
  const owner = useAuthStore(s => s.session?.user.id);
  const target = useNutritionStore(s => s.dailyTargets?.macros.caloriesKcal ?? null);
  const liveEntries = useNutritionStore(s => s.entries);
  const today = localDateKey(new Date());
  const [view, setView] = useState<'week' | 'month'>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [cursor, setCursor] = useState(() => { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() }; });
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [adding, setAdding] = useState(false);

  const week = useMemo(() => weekDates(today, weekOffset), [today, weekOffset]);
  const monthDays = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const from = view === 'week' ? week[0] : monthStart(cursor.year, cursor.month);
  const to = view === 'week' ? week[6] : addDays(monthStart(cursor.year, cursor.month), monthDays - 1);
  const history = useQuery({ enabled: !!owner, queryKey: ['history-range', owner, from, to], queryFn: () => loadHistory(owner!, from, to), staleTime: 120_000 });
  const entries = useQuery({ enabled: !!owner, queryKey: ['history-entries-range', owner, from, to], queryFn: () => loadEntriesForRange(owner!, from, to), staleTime: 120_000 });
  const byDate = useMemo(() => new Map((history.data ?? []).map(day => [day.log_date, day])), [history.data]);

  const isToday = selected === today;
  const dayEntries = isToday ? liveEntries : entries.data?.[selected] ?? [];
  const loggedKcal = isToday
    ? dayEntries.reduce((sum, entry) => sum + entry.macros.caloriesKcal, 0)
    : byDate.get(selected)?.calories_kcal ?? null;
  const status = dayStatus(loggedKcal, target);
  const streak = useMemo(() => perfectDays(history.data ?? [], target), [history.data, target]);
  const future = (date: string) => date > today;

  const copyDay = () => {
    for (const entry of dayEntries) nutritionStore.getState().addEntry({ name: entry.name, meal: entry.meal, servings: entry.servings,
      servingLabel: entry.servingLabel, referenceMacros: entry.referenceMacros, referenceMicros: entry.referenceMicros, source: entry.source });
    haptic('success');
  };

  return <SafeAreaView edges={['left', 'right']} className="flex-1 bg-background">
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <Reveal index={0}>
        <Text className="text-sm font-bold tracking-widest">FOOD LOG</Text>
        <Text className="mb-1 mt-2 text-4xl font-bold">Everything you ate</Text>
        <Text className="mb-4">A tick marks a day you landed within {PERFECT_WINDOW_KCAL} kcal of your target.</Text>
        <View className="mb-4 flex-row flex-wrap">
          <Choice label="This week" selected={view === 'week'} onPress={() => { setView('week'); haptic('selection'); }} />
          <Choice label="Month" selected={view === 'month'} onPress={() => { setView('month'); haptic('selection'); }} />
        </View>
      </Reveal>

      {view === 'week' && <Reveal index={1}>
        <View className="mb-3 flex-row items-center justify-between gap-2">
          <Pressable accessibilityRole="button" accessibilityLabel="Previous week" weight="subtle" onPress={() => { setWeekOffset(value => value - 1); haptic('selection'); }}
            className="h-11 w-11 items-center justify-center rounded-full bg-surface"><Text className="text-lg font-bold">‹</Text></Pressable>
          <Text className="flex-1 text-center text-sm font-bold">{weekOffset === 0 ? 'This week' : `${week[0]} → ${week[6]}`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next week" weight="subtle" disabled={weekOffset >= 0}
            onPress={() => { setWeekOffset(value => Math.min(0, value + 1)); haptic('selection'); }}
            style={weekOffset >= 0 ? { opacity: .3 } : undefined}
            className="h-11 w-11 items-center justify-center rounded-full bg-surface"><Text className="text-lg font-bold">›</Text></Pressable>
        </View>
        <View className="flex-row gap-1">
          {week.map(date => {
            const day = dayStatus(date === today ? loggedKcal : byDate.get(date)?.calories_kcal, target);
            const chosen = date === selected;
            return <Pressable key={date} accessibilityRole="button" accessibilityState={{ selected: chosen }}
              accessibilityLabel={`${dayLabel(date)}. ${day.label}`} disabled={future(date)}
              onPress={() => { setSelected(date); haptic('selection'); }} weight="firm" style={{ flex: 1, opacity: future(date) ? .3 : 1 }}
              className={`items-center rounded-2xl py-3 ${chosen ? 'bg-accent' : MARK_TONE[day.mark]}`}>
              <Text className="text-xs">{shortWeekday(date)}</Text>
              <Text className={`my-1 text-base ${date === today ? 'font-bold underline' : 'font-bold'}`}>{dayOfMonth(date)}</Text>
              <Text className="text-xs">{day.glyph}</Text>
            </Pressable>;
          })}
        </View>
      </Reveal>}

      {view === 'month' && <Reveal index={1}>
        <View className="mb-3 flex-row items-center justify-between gap-2">
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" weight="subtle"
            onPress={() => { const next = new Date(cursor.year, cursor.month - 1, 1); setCursor({ year: next.getFullYear(), month: next.getMonth() }); haptic('selection'); }}
            className="h-11 w-11 items-center justify-center rounded-full bg-surface"><Text className="text-lg font-bold">‹</Text></Pressable>
          <Text className="flex-1 text-center text-base font-bold">{new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next month" weight="subtle"
            onPress={() => { const next = new Date(cursor.year, cursor.month + 1, 1); setCursor({ year: next.getFullYear(), month: next.getMonth() }); haptic('selection'); }}
            className="h-11 w-11 items-center justify-center rounded-full bg-surface"><Text className="text-lg font-bold">›</Text></Pressable>
        </View>
        <View className="flex-row">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) =>
          <View key={index} style={{ flex: 1 }} className="items-center pb-2"><Text className="text-xs">{day}</Text></View>)}</View>
        <View className="flex-row flex-wrap">
          {Array.from({ length: leadingBlanks(cursor.year, cursor.month) }, (_, i) => <View key={`blank-${i}`} style={{ width: `${100 / 7}%` }} className="p-1" />)}
          {Array.from({ length: monthDays }, (_, i) => {
            const date = dateKey(new Date(cursor.year, cursor.month, i + 1));
            const day = dayStatus(date === today ? loggedKcal : byDate.get(date)?.calories_kcal, target);
            const chosen = date === selected;
            return <View key={date} style={{ width: `${100 / 7}%` }} className="p-1">
              <Pressable accessibilityRole="button" accessibilityState={{ selected: chosen }} disabled={future(date)}
                accessibilityLabel={`${dayLabel(date)}. ${day.label}`} weight="firm"
                onPress={() => { setSelected(date); haptic('selection'); }}
                style={future(date) ? { opacity: .3 } : undefined}
                className={`items-center rounded-xl py-2 ${chosen ? 'bg-accent' : MARK_TONE[day.mark]}`}>
                <Text className={date === today ? 'font-bold underline' : ''}>{i + 1}</Text>
                <Text className="text-[11px]">{day.glyph}</Text>
              </Pressable>
            </View>;
          })}
        </View>
        <Text className="mt-3 text-sm">{streak.logged
          ? `${streak.hit} of ${streak.logged} logged days landed within ${PERFECT_WINDOW_KCAL} kcal of target.`
          : 'Nothing logged in this month yet.'}</Text>
      </Reveal>}

      {(history.isPending || entries.isPending) && <View className="mt-4"><LoadingCards label="Loading your log…" /></View>}
      {(history.isError || entries.isError) && <Text className="mt-4">Your cloud diary could not be loaded. Today is still logged on this device.</Text>}

      <Reveal index={2}>
        <View className="mt-5 rounded-3xl border border-border bg-surface p-5">
          <Text className="text-sm font-bold tracking-widest">{isToday ? 'TODAY' : dayLabel(selected).toUpperCase()}</Text>
          <Text className="my-2 text-4xl font-bold">{loggedKcal == null || loggedKcal <= 0 ? '—' : `${Math.round(loggedKcal)} kcal`}</Text>
          <Text className="mb-1">{status.label}{target !== null ? ` · target ${Math.round(target)} kcal` : ''}</Text>
          {target === null && <Text className="text-sm">Set a calorie target in Settings and these days start being marked.</Text>}

          {!dayEntries.length && <Text className="mt-3">No foods recorded on this day.</Text>}
          {MEAL_SLOTS.filter(slot => dayEntries.some(entry => entry.meal === slot)).map(slot => {
            const items = dayEntries.filter(entry => entry.meal === slot);
            const calories = items.reduce((sum, entry) => sum + entry.macros.caloriesKcal, 0);
            return <View key={slot} className="mt-4">
              <View className="mb-2 flex-row items-baseline justify-between gap-3">
                <Text className="flex-1 text-sm font-bold tracking-widest">{MEAL_LABELS[slot].toUpperCase()}</Text>
                <Text className="text-sm">{Math.round(calories)} kcal</Text>
              </View>
              {items.map(entry => <EntryLine key={entry.id} entry={entry} onEdit={isToday ? setEditing : undefined} />)}
            </View>;
          })}

          {isToday && <Pressable accessibilityRole="button" accessibilityLabel="Add a food to today"
            onPress={() => setAdding(true)} className="mt-4 items-center rounded-xl bg-raised p-3"><Text className="font-bold">Add a food</Text></Pressable>}
          {!isToday && !!dayEntries.length && <Pressable accessibilityRole="button" accessibilityLabel="Copy this day into today"
            onPress={copyDay} className="mt-4 items-center rounded-xl bg-raised p-3"><Text className="font-bold">Copy this day into today</Text></Pressable>}
        </View>
      </Reveal>

      {editing && <EntryEditor entry={editing} onClose={() => setEditing(null)} />}
      {adding && <FoodSearchModal onClose={() => setAdding(false)} />}
    </ScrollView>
  </SafeAreaView>;
}
