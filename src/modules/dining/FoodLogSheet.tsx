import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { Text, TextInput } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';
import { NUTRIENT_UNITS, type NutrientKey } from '../../types/nutrition';
import type { MacroTotals } from '../../types/nutrition';
import type { DailyMenuItem } from '../../types/nutrislice';
import type { MealSlot } from '../../types/foodEntry';
import { nutritionStore } from '../../store/nutritionStore';
import { servingLabel } from './serving';
import { foodLogAmounts } from './logFood';

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
