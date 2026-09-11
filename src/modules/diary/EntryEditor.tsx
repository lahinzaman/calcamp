import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Action, Choice, Field } from '../../components/FormControls';
import { nutritionStore } from '../../store/nutritionStore';
import { MEAL_LABELS, MEAL_SLOTS, SOURCE_LABELS, scaleMacros, type FoodEntry } from '../../types/foodEntry';
import { haptic } from '../../theme/haptics';
export function EntryEditor({ entry, onClose }: { entry: FoodEntry; onClose: () => void }) {
  const [servings, setServings] = useState(String(entry.servings));
  const [meal, setMeal] = useState(entry.meal);
  const [error, setError] = useState<string | null>(null);
  const parsed = Number(servings);
  const preview = Number.isFinite(parsed) && parsed > 0 ? scaleMacros(entry.referenceMacros, parsed) : null;
  const save = () => {
    try { nutritionStore.getState().updateEntry(entry.id, { servings: parsed, meal }); haptic('success'); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the portion and try again.'); }
  };
  const remove = () => { nutritionStore.getState().removeEntry(entry.id); haptic('warning'); onClose(); };
  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text className="text-sm font-bold tracking-widest">EDIT LOGGED FOOD</Text>
        <Text className="mb-1 mt-2 text-3xl font-bold">{entry.name}</Text>
        <Text className="mb-5 text-sm">{SOURCE_LABELS[entry.source]}{entry.servingLabel ? ` · ${entry.servingLabel} per serving` : ''}</Text>
        <Field label="Servings" value={servings} onChangeText={setServings} keyboardType="decimal-pad" />
        {preview && <View className="mb-5 rounded-3xl bg-surface p-5">
          <Text className="text-sm font-bold">NEW TOTAL FOR THIS FOOD</Text>
          <Text className="my-2 text-4xl font-bold">{Math.round(preview.caloriesKcal)} kcal</Text>
          <Text>Protein {Math.round(preview.proteinG)} g · Carbs {Math.round(preview.carbsG)} g · Fat {Math.round(preview.fatG)} g</Text>
        </View>}
        <Text className="mb-2 font-bold">Meal</Text>
        <View className="mb-4 flex-row flex-wrap">{MEAL_SLOTS.map(slot => <Choice key={slot} label={MEAL_LABELS[slot]} selected={meal === slot} onPress={() => setMeal(slot)} />)}</View>
        {error && <Text accessibilityRole="alert" className="mb-4">{error}</Text>}
        <Action label="Save changes" onPress={save} tone="success" />
        <Action secondary label="Remove from diary" onPress={remove} />
        <Action secondary label="Cancel" onPress={onClose} />
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
