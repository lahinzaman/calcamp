import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { ProgressBar, Reveal } from '../../theme/motion';
import { Choice } from '../../components/FormControls';
import { LoadingCards } from '../../components/LoadingCards';
import { SyncIndicator } from '../../components/SyncIndicator';
import { WaterTracker } from '../../components/WaterTracker';
import { CalorieRing } from '../../components/charts/CalorieRing';
import { haptic } from '../../theme/haptics';
import { useAuthStore } from '../../store/authStore';
import { localDateKey, nutritionStore, useNutritionStore } from '../../store/nutritionStore';
import { loadEntriesForRange, loadHistory } from '../../api/history';
import { MEAL_LABELS, MEAL_SLOTS, SOURCE_LABELS, type FoodEntry } from '../../types/foodEntry';
import { foodEmoji } from '../dining/foodEmoji';
import { EntryEditor } from '../diary/EntryEditor';
import { FoodSearchModal } from '../foods/FoodSearchModal';
import { MicronutrientPanel } from '../nutrition/MicronutrientPanel';
import { mealTargets, readSplitId, splitById } from '../nutrition/mealTargets';
import { TargetReviewCard } from '../nutrition/TargetReviewCard';
import { StreakCard } from '../habits/StreakCard';
import {
  PERFECT_WINDOW_KCAL, addDays, dateKey, dayLabel, dayOfMonth,
  dayStatus, shortWeekday, timeOfDay, weekDates,
} from '../diary/logCalendar';

const MACROS = [['Protein', 'proteinG', 'protein'], ['Carbs', 'carbsG', 'carbs'], ['Fat', 'fatG', 'fat']] as const;
const MARK_TONE: Record<string, string> = { perfect: 'bg-accent', over: 'bg-raised', under: 'bg-raised', logged: 'bg-surface', none: 'bg-raised' };
const monthStart = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}-01`;
const leadingBlanks = (year: number, month: number) => (new Date(year, month, 1).getDay() + 6) % 7;

function EntryLine({ entry, onEdit }: { entry: FoodEntry; onEdit?: (entry: FoodEntry) => void }) {
  const body = <View className="flex-row items-start gap-3">
    <Text className="text-2xl">{foodEmoji(entry.name)}</Text>
    <View className="flex-1">
      <Text className="font-bold">{entry.name}</Text>
      <Text className="text-sm">{timeOfDay(entry.loggedAtMs)} · {Number(entry.servings.toFixed(2))} × {entry.servingLabel ?? 'serving'} · {SOURCE_LABELS[entry.source]}</Text>
    </View>
    <Text className="text-lg font-bold" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(entry.macros.caloriesKcal)}</Text>
  </View>;
  if (!onEdit) return <View className="mb-2 rounded-2xl bg-raised px-4 py-3">{body}</View>;
  return <View className="mb-2 flex-row items-center gap-2">
    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${entry.name}`} onPress={() => onEdit(entry)} weight="subtle"
      className="flex-1 rounded-2xl bg-raised px-4 py-3">{body}</Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${entry.name}`} tone="warning" weight="subtle"
      onPress={() => { nutritionStore.getState().removeEntry(entry.id); haptic('warning'); }}
      className="h-12 w-12 items-center justify-center rounded-full bg-surface"><Text className="text-lg font-bold">×</Text></Pressable>
  </View>;
}

/**
 * One screen for any day. Yesterday is not somewhere you navigate to — it is this screen on
 * a different date, which is what the separate calendar and history screens were doing
 * three different ways.
 */
export default function TodayScreen() {
  const owner = useAuthStore(s => s.session?.user.id);
  const split = useMemo(() => splitById(readSplitId(owner ?? 'anonymous')).split, [owner]);
  const targets = useNutritionStore(s => s.dailyTargets?.macros);
  const liveMacros = useNutritionStore(s => s.consumedMacros);
  const liveMicros = useNutritionStore(s => s.consumedMicros);
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
  const day = byDate.get(selected);
  const dayEntries = isToday ? liveEntries : entries.data?.[selected] ?? [];
  const macros = isToday ? liveMacros
    : day ? { caloriesKcal: day.calories_kcal ?? 0, proteinG: day.proteinG ?? 0, carbsG: day.carbsG ?? 0, fatG: day.fatG ?? 0 } : null;
  const micros = isToday ? liveMicros : day?.micros ?? {};
  const status = dayStatus(isToday ? liveMacros.caloriesKcal : day?.calories_kcal, targets?.caloriesKcal ?? null);
  const energyFromMacros = macros ? macros.proteinG * 4 + macros.carbsG * 4 + macros.fatG * 9 : 0;
  const perMeal = useMemo(() => mealTargets(targets, split), [targets, split]);

  const copyDay = () => {
    for (const entry of dayEntries) nutritionStore.getState().addEntry({ name: entry.name, meal: entry.meal, servings: entry.servings,
      servingLabel: entry.servingLabel, referenceMacros: entry.referenceMacros, referenceMicros: entry.referenceMicros, source: entry.source });
    haptic('success');
  };

  return <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background">
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <Reveal index={0}>
        <Text className="text-sm font-bold tracking-widest">CALCAMP</Text>
        <Text className="mb-1 mt-2 text-4xl font-bold">{isToday ? 'Today' : dayLabel(selected)}</Text>
        <Text className="mb-4">{isToday ? 'Everything you have logged so far.' : 'A day you already logged.'}</Text>
        <SyncIndicator />
        <View className="mb-3 flex-row flex-wrap">
          <Choice label="Week" selected={view === 'week'} onPress={() => { setView('week'); haptic('selection'); }} />
          <Choice label="Month" selected={view === 'month'} onPress={() => { setView('month'); haptic('selection'); }} />
          {!isToday && <Choice label="Jump to today" selected={false} onPress={() => { setSelected(today); setWeekOffset(0); haptic('selection'); }} />}
        </View>
      </Reveal>

      <Reveal index={1}>
        {view === 'week' && <>
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
              const marked = dayStatus(date === today ? liveMacros.caloriesKcal : byDate.get(date)?.calories_kcal, targets?.caloriesKcal ?? null);
              const chosen = date === selected;
              return <Pressable key={date} accessibilityRole="button" accessibilityState={{ selected: chosen }}
                accessibilityLabel={`${dayLabel(date)}. ${marked.label}`} disabled={date > today}
                onPress={() => { setSelected(date); haptic('selection'); }} weight="firm" style={{ flex: 1, opacity: date > today ? .3 : 1 }}
                className={`items-center rounded-2xl py-3 ${chosen ? 'bg-accent' : MARK_TONE[marked.mark]}`}>
                <Text className="text-xs">{shortWeekday(date)}</Text>
                <Text className={`my-1 text-base font-bold ${date === today ? 'underline' : ''}`}>{dayOfMonth(date)}</Text>
                <Text className="text-xs">{marked.glyph}</Text>
              </Pressable>;
            })}
          </View>
        </>}
        {view === 'month' && <>
          <View className="mb-3 flex-row items-center justify-between gap-2">
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" weight="subtle"
              onPress={() => { const next = new Date(cursor.year, cursor.month - 1, 1); setCursor({ year: next.getFullYear(), month: next.getMonth() }); haptic('selection'); }}
              className="h-11 w-11 items-center justify-center rounded-full bg-surface"><Text className="text-lg font-bold">‹</Text></Pressable>
            <Text className="flex-1 text-center text-base font-bold">{new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" weight="subtle"
              onPress={() => { const next = new Date(cursor.year, cursor.month + 1, 1); setCursor({ year: next.getFullYear(), month: next.getMonth() }); haptic('selection'); }}
              className="h-11 w-11 items-center justify-center rounded-full bg-surface"><Text className="text-lg font-bold">›</Text></Pressable>
          </View>
          <View className="flex-row">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) =>
            <View key={index} style={{ flex: 1 }} className="items-center pb-2"><Text className="text-xs">{label}</Text></View>)}</View>
          <View className="flex-row flex-wrap">
            {Array.from({ length: leadingBlanks(cursor.year, cursor.month) }, (_, i) => <View key={`blank-${i}`} style={{ width: `${100 / 7}%` }} className="p-1" />)}
            {Array.from({ length: monthDays }, (_, i) => {
              const date = dateKey(new Date(cursor.year, cursor.month, i + 1));
              const marked = dayStatus(date === today ? liveMacros.caloriesKcal : byDate.get(date)?.calories_kcal, targets?.caloriesKcal ?? null);
              const chosen = date === selected;
              return <View key={date} style={{ width: `${100 / 7}%` }} className="p-1">
                <Pressable accessibilityRole="button" accessibilityState={{ selected: chosen }} disabled={date > today}
                  accessibilityLabel={`${dayLabel(date)}. ${marked.label}`} weight="firm"
                  onPress={() => { setSelected(date); haptic('selection'); }}
                  style={date > today ? { opacity: .3 } : undefined}
                  className={`items-center rounded-xl py-2 ${chosen ? 'bg-accent' : MARK_TONE[marked.mark]}`}>
                  <Text className={date === today ? 'font-bold underline' : ''}>{i + 1}</Text>
                  <Text className="text-[11px]">{marked.glyph}</Text>
                </Pressable>
              </View>;
            })}
          </View>
        </>}
        <Text className="mb-4 mt-2 text-xs">A tick is a day within {PERFECT_WINDOW_KCAL} kcal of your calorie target.</Text>
      </Reveal>

      {(history.isLoading || entries.isLoading) && <LoadingCards label="Loading your diary…" />}

      <Reveal index={2}>
        <View className="mb-4 rounded-3xl border border-border bg-surface p-5">
          <Text className="mb-3 text-sm font-bold tracking-widest">DAILY ENERGY</Text>
          <CalorieRing consumed={macros?.caloriesKcal ?? 0} target={targets?.caloriesKcal ?? null} />
          <Text className="mt-3 text-center text-sm">{status.label}</Text>
          {!targets && <Text className="mt-2 text-center text-sm">Set daily targets in Profile to track against a goal.</Text>}
          <View className="mt-5">
            {MACROS.map(([label, key, tone]) => {
              const grams = macros?.[key] ?? 0;
              const target = targets?.[key] ?? null;
              const left = target === null ? null : Math.round(target - grams);
              const share = energyFromMacros > 0 ? (grams * (key === 'fatG' ? 9 : 4)) / energyFromMacros * 100 : null;
              return <View key={key} className="mb-4">
                <View className="mb-1 flex-row flex-wrap items-baseline justify-between gap-2">
                  <Text className="font-bold" style={{ flexGrow: 1, flexBasis: 90 }}>{label}</Text>
                  <Text className="text-2xl font-bold" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(grams)} g</Text>
                  {target !== null && <Text className="text-sm" style={{ fontVariant: ['tabular-nums'] }}>of {Math.round(target)} g</Text>}
                </View>
                <ProgressBar value={grams} target={target ?? 0} tone={tone} height={12} />
                <Text className="mt-1 text-sm">
                  {left === null ? 'No target set' : left >= 0 ? `${left} g left` : `${Math.abs(left)} g over`}
                  {share !== null ? ` · ${Math.round(share)}% of the day's calories` : ''}
                </Text>
              </View>;
            })}
          </View>
        </View>
      </Reveal>

      <MicronutrientPanel index={3} micros={micros} />
      {isToday && <><StreakCard /><TargetReviewCard /><WaterTracker /></>}

      <Reveal index={4}>
        <View className="mb-5 rounded-3xl border border-border bg-surface p-5">
          <View className="mb-3 flex-row items-baseline justify-between gap-3">
            <Text className="flex-1 text-sm font-bold tracking-widest">DIARY</Text>
            {isToday && !!liveEntries.length && <Pressable accessibilityRole="button" accessibilityLabel="Undo last logged food" weight="subtle" tone="warning"
              onPress={() => { nutritionStore.getState().undoLastEntry(); haptic('warning'); }}
              className="rounded-full bg-raised px-4 py-2"><Text className="text-sm font-bold">Undo last</Text></Pressable>}
          </View>
          {!dayEntries.length && <Text>{isToday
            ? 'Nothing logged yet. Tap + to search, scan a barcode, or photograph a plate.'
            : 'No foods were recorded on this day.'}</Text>}
          {MEAL_SLOTS.filter(slot => dayEntries.some(entry => entry.meal === slot)).map(slot => {
            const items = dayEntries.filter(entry => entry.meal === slot);
            const calories = items.reduce((sum, entry) => sum + entry.macros.caloriesKcal, 0);
            return <View key={slot} className="mb-4">
              <View className="mb-2 flex-row items-baseline justify-between gap-3">
                <Text className="flex-1 text-sm font-bold">{MEAL_LABELS[slot]}</Text>
                <Text className="text-sm" style={{ fontVariant: ['tabular-nums'] }}>
                  {Math.round(calories)}{perMeal[slot] ? ` / ${Math.round(perMeal[slot]!.caloriesKcal)}` : ''} kcal
                </Text>
              </View>
              {items.map(entry => <EntryLine key={entry.id} entry={entry} onEdit={isToday ? setEditing : undefined} />)}
            </View>;
          })}
          {isToday && <Pressable accessibilityRole="button" accessibilityLabel="Add a food to today" onPress={() => setAdding(true)}
            className="mt-1 min-h-12 items-center justify-center rounded-xl bg-raised p-3"><Text className="font-bold">Add a food</Text></Pressable>}
          {!isToday && !!dayEntries.length && <Pressable accessibilityRole="button" accessibilityLabel="Copy this day into today" onPress={copyDay}
            className="mt-1 min-h-12 items-center justify-center rounded-xl bg-raised p-3"><Text className="font-bold">Copy this day into today</Text></Pressable>}
        </View>
      </Reveal>

      {editing && <EntryEditor entry={editing} onClose={() => setEditing(null)} />}
      {adding && <FoodSearchModal onClose={() => setAdding(false)} />}
    </ScrollView>
  </SafeAreaView>;
}
