import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';
import { Pressable } from '../../theme/Pressable';
import { Reveal } from '../../theme/motion';
import { LoadingCards } from '../../components/LoadingCards';
import { useAuthStore } from '../../store/authStore';
import { nutritionStore, localDateKey } from '../../store/nutritionStore';
import { loadEntriesForRange, loadHistory, shiftDate } from '../../api/history';
import { MEAL_LABELS, MEAL_SLOTS } from '../../types/foodEntry';
import { haptic } from '../../theme/haptics';
const WINDOW = 30;
const weekday = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
export default function HistoryScreen() {
  const owner = useAuthStore(s => s.session?.user.id);
  const today = localDateKey(new Date());
  const from = shiftDate(today, -(WINDOW - 1));
  const [open, setOpen] = useState<string | null>(null);
  const history = useQuery({ enabled: !!owner, queryKey: ['history', owner, WINDOW, today], queryFn: () => loadHistory(owner!, from, today) });
  const entries = useQuery({ enabled: !!owner, queryKey: ['history-entries', owner, WINDOW, today], queryFn: () => loadEntriesForRange(owner!, from, today) });
  const days = [...(history.data ?? [])].reverse();
  const copyDay = (date: string) => {
    const source = entries.data?.[date] ?? [];
    if (!source.length) return;
    for (const entry of source) nutritionStore.getState().addEntry({ name: entry.name, meal: entry.meal, servings: entry.servings,
      servingLabel: entry.servingLabel, referenceMacros: entry.referenceMacros, referenceMicros: entry.referenceMicros, source: entry.source });
    haptic('success');
  };
  return <SafeAreaView edges={['left','right']} className="flex-1 bg-background">
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <Reveal index={0}><Text className="mb-1 text-3xl font-bold">Past 30 days</Text><Text className="mb-4">Tap a day to see what you ate, or copy it into today.</Text></Reveal>
      {history.isPending && <LoadingCards label="Loading your diary history…" />}
      {history.isError && <Text>Your history could not be loaded. Try again when connected.</Text>}
      {!history.isPending && !history.isError && !days.length && <Text>No days logged yet. Once you log a day it appears here.</Text>}
      {days.map((day, index) => {
        const items = entries.data?.[day.log_date] ?? [];
        const expanded = open === day.log_date;
        return <Reveal key={day.log_date} index={Math.min(index, 6)}>
          <View className="mb-2 rounded-2xl bg-surface p-4">
            <Pressable accessibilityRole="button" accessibilityLabel={`Show ${weekday(day.log_date)}`} accessibilityState={{ expanded }}
              weight="subtle" onPress={() => setOpen(expanded ? null : day.log_date)} className="flex-row items-center gap-3">
              <View className="flex-1">
                <Text className="font-bold">{weekday(day.log_date)}{day.log_date === today ? ' · today' : ''}</Text>
                <Text className="text-sm">{day.calories_kcal === null ? 'Nothing logged' : `${Math.round(day.calories_kcal)} kcal · P ${Math.round(day.proteinG ?? 0)} · C ${Math.round(day.carbsG ?? 0)} · F ${Math.round(day.fatG ?? 0)}`}</Text>
              </View>
              {day.body_weight_lbs !== null && <Text className="text-sm">{Number(day.body_weight_lbs.toFixed(1))} lbs</Text>}
              {day.is_adherent && <Text accessibilityLabel="Marked adherent" className="text-sm">✓</Text>}
            </Pressable>
            {expanded && <View className="mt-3 border-t border-border pt-3">
              {!items.length && <Text className="text-sm">No individual foods were recorded for this day.</Text>}
              {MEAL_SLOTS.filter(slot => items.some(e => e.meal === slot)).map(slot => <View key={slot} className="mb-2">
                <Text className="text-sm font-bold">{MEAL_LABELS[slot]}</Text>
                {items.filter(e => e.meal === slot).map(entry => <Text key={entry.id} className="text-sm">· {entry.name} — {Math.round(entry.macros.caloriesKcal)} kcal</Text>)}
              </View>)}
              {!!items.length && day.log_date !== today && <Pressable accessibilityRole="button" accessibilityLabel={`Copy ${weekday(day.log_date)} into today`}
                onPress={() => copyDay(day.log_date)} className="mt-2 items-center rounded-xl bg-raised p-3"><Text className="font-bold">Copy this day into today</Text></Pressable>}
            </View>}
          </View>
        </Reveal>;
      })}
    </ScrollView>
  </SafeAreaView>;
}
