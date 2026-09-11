import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { Pressable } from '../../theme/Pressable';
import { Text } from '../../theme/primitives';
import { Reveal, TIMING } from '../../theme/motion';
import { haptic } from '../../theme/haptics';
import { useNutritionStore, nutritionStore } from '../../store/nutritionStore';
import { MEAL_LABELS, MEAL_SLOTS, type FoodEntry, type MealSlot } from '../../types/foodEntry';
import { foodEmoji } from '../dining/foodEmoji';
import { EntryEditor } from './EntryEditor';

function EntryRow({ entry, onEdit, onRemove }: { entry: FoodEntry; onEdit: (entry: FoodEntry) => void; onRemove: (entry: FoodEntry) => void }) {
  return <Animated.View layout={LinearTransition.duration(TIMING.base).reduceMotion(ReduceMotion.System)}
    entering={FadeIn.duration(TIMING.base).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(TIMING.fast).reduceMotion(ReduceMotion.System)}>
    <View className="mb-2 flex-row items-center gap-2">
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${entry.name}`} onPress={() => onEdit(entry)} weight="subtle" className="flex-1 flex-row items-center gap-3 rounded-2xl bg-surface px-4 py-3">
        <Text className="text-2xl">{foodEmoji(entry.name)}</Text>
        <View className="flex-1">
          <Text className="font-bold" numberOfLines={1}>{entry.name}</Text>
          <Text className="text-sm">{Number(entry.servings.toFixed(2))} × {entry.servingLabel ?? 'serving'} · P {Math.round(entry.macros.proteinG)} · C {Math.round(entry.macros.carbsG)} · F {Math.round(entry.macros.fatG)}</Text>
        </View>
        <Text className="text-lg font-bold">{Math.round(entry.macros.caloriesKcal)}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${entry.name}`} tone="warning" weight="subtle"
        onPress={() => { const removed = nutritionStore.getState().removeEntry(entry.id); if (removed) onRemove(removed); }}
        className="h-12 w-12 items-center justify-center rounded-full bg-raised"><Text className="text-lg font-bold">×</Text></Pressable>
    </View>
  </Animated.View>;
}

export function FoodDiary() {
  const entries = useNutritionStore(s => s.entries);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [undo, setUndo] = useState<FoodEntry | null>(null);
  const grouped = MEAL_SLOTS.map(slot => ({ slot, items: entries.filter(e => e.meal === slot) })).filter(group => group.items.length);

  if (!entries.length) return <Reveal index={2}><View className="mb-5 items-start rounded-3xl border border-border bg-surface p-6">
    <Text className="text-xl font-bold">Nothing logged yet today</Text>
    <Text className="mb-4 mt-2">Tap the + button to scan a barcode, photograph a plate, or add a food by hand. Everything you log appears here and stays editable.</Text>
  </View></Reveal>;

  return <Reveal index={2}><Animated.View layout={LinearTransition.duration(TIMING.base).reduceMotion(ReduceMotion.System)} className="mb-5">
    <View className="mb-3 flex-row items-baseline justify-between">
      <Text className="text-xl font-bold">Today's diary</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Undo last logged food" weight="subtle" tone="warning"
        onPress={() => { const removed = nutritionStore.getState().undoLastEntry(); if (removed) { setUndo(removed); haptic('warning'); } }}
        className="rounded-full bg-raised px-4 py-2"><Text className="text-sm font-bold">Undo last</Text></Pressable>
    </View>
    {grouped.map(group => <Animated.View key={group.slot} layout={LinearTransition.duration(TIMING.base).reduceMotion(ReduceMotion.System)} className="mb-4">
      <MealHeading slot={group.slot} items={group.items} />
      {group.items.map(entry => <EntryRow key={entry.id} entry={entry} onEdit={setEditing} onRemove={setUndo} />)}
    </Animated.View>)}
    {undo && <Animated.View entering={FadeIn.duration(TIMING.base).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(TIMING.fast).reduceMotion(ReduceMotion.System)}>
      <View className="flex-row items-center gap-3 rounded-2xl bg-raised p-4">
        <Text className="flex-1 text-sm">Removed {undo.name}.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Restore ${undo.name}`} weight="subtle"
          onPress={() => { const entry = undo; setUndo(null); nutritionStore.getState().addEntry({ id: entry.id, name: entry.name, meal: entry.meal, servings: entry.servings, servingLabel: entry.servingLabel, referenceMacros: entry.referenceMacros, referenceMicros: entry.referenceMicros, source: entry.source }); haptic('success'); }}
          className="rounded-full bg-surface px-4 py-2"><Text className="font-bold">Restore</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss undo" weight="subtle" onPress={() => setUndo(null)} className="px-2"><Text>×</Text></Pressable>
      </View>
    </Animated.View>}
    {editing && <EntryEditor entry={editing} onClose={() => setEditing(null)} />}
  </Animated.View></Reveal>;
}

function MealHeading({ slot, items }: { slot: MealSlot; items: FoodEntry[] }) {
  const calories = items.reduce((sum, entry) => sum + entry.macros.caloriesKcal, 0);
  return <View className="mb-2 flex-row items-baseline justify-between">
    <Text className="text-sm font-bold tracking-widest">{MEAL_LABELS[slot].toUpperCase()}</Text>
    <Text className="text-sm">{Math.round(calories)} kcal</Text>
  </View>;
}
