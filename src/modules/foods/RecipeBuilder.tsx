import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Action, Field } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { orderFoods, readSavedFoods, type SavedFood } from './savedFoods';
import { perServing, saveRecipe, type Recipe, type RecipeItem } from './recipes';
const newId = () => globalThis.crypto?.randomUUID?.() ?? `recipe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export function RecipeBuilder({ owner, existing, onClose, onSaved }: { owner: string; existing?: Recipe; onClose: () => void; onSaved: (recipes: Recipe[]) => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [yieldServings, setYieldServings] = useState(String(existing?.yieldServings ?? 4));
  const [items, setItems] = useState<RecipeItem[]>(existing?.items ?? []);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const pantry = orderFoods(readSavedFoods(owner), 'frequent');
  const draft = { items, yieldServings: Number(yieldServings) };
  const single = perServing(draft);
  const add = (food: SavedFood) => { setItems(current => [...current, { name: food.name, servings: 1, macros: food.macros, micros: food.micros }]); setPicking(false); haptic('selection'); };
  const save = () => {
    try {
      const next = saveRecipe(owner, { id: existing?.id ?? newId(), name, yieldServings: Number(yieldServings), items, updatedAtMs: Date.now() });
      onSaved(next); haptic('success'); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This recipe could not be saved.'); }
  };
  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text className="mb-4 text-3xl font-bold">{existing ? 'Edit recipe' : 'New recipe'}</Text>
        <Field label="Recipe name" value={name} onChangeText={setName} maxLength={80} placeholder="Sunday chili" />
        <Field label="How many servings does it make?" value={yieldServings} onChangeText={setYieldServings} keyboardType="decimal-pad" />
        <Text className="mb-2 mt-2 font-bold">Ingredients</Text>
        {!items.length && <Text className="mb-3 text-sm">Add ingredients from foods you have logged before.</Text>}
        {items.map((item, index) => <View key={`${item.name}-${index}`} className="mb-2 flex-row items-center gap-2">
          <View className="flex-1"><Text className="font-bold" numberOfLines={1}>{item.name}</Text><Text className="text-sm">{Math.round(item.macros.caloriesKcal * item.servings)} kcal</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Less ${item.name}`} weight="subtle"
            onPress={() => setItems(current => current.map((entry, i) => i === index ? { ...entry, servings: Math.max(.25, Number((entry.servings - .5).toFixed(2))) } : entry))}
            className="h-12 w-12 items-center justify-center rounded-full bg-raised"><Text className="font-bold">−</Text></Pressable>
          <Text style={{ width: 40, textAlign: 'center' }}>{item.servings}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`More ${item.name}`} weight="subtle"
            onPress={() => setItems(current => current.map((entry, i) => i === index ? { ...entry, servings: Number((entry.servings + .5).toFixed(2)) } : entry))}
            className="h-12 w-12 items-center justify-center rounded-full bg-raised"><Text className="font-bold">+</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} weight="subtle" tone="warning"
            onPress={() => setItems(current => current.filter((_, i) => i !== index))}
            className="h-12 w-12 items-center justify-center rounded-full bg-raised"><Text>×</Text></Pressable>
        </View>)}
        <Action secondary label="Add an ingredient" onPress={() => setPicking(true)} />
        {!!items.length && <View className="my-4 rounded-3xl bg-surface p-5">
          <Text className="text-sm font-bold tracking-widest">PER SERVING</Text>
          <Text className="my-2 text-3xl font-bold">{Math.round(single.macros.caloriesKcal)} kcal</Text>
          <Text>Protein {Math.round(single.macros.proteinG)} g · Carbs {Math.round(single.macros.carbsG)} g · Fat {Math.round(single.macros.fatG)} g</Text>
        </View>}
        {error && <Text accessibilityRole="alert" className="mb-4">{error}</Text>}
        <Action label="Save recipe" onPress={save} tone="success" />
        <Action secondary label="Cancel" onPress={onClose} />
        {picking && <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={() => setPicking(false)}>
          <SafeAreaView className="flex-1 bg-background"><ScrollView contentContainerStyle={{ padding: 24 }}>
            <Text className="mb-4 text-2xl font-bold">Choose an ingredient</Text>
            {!pantry.length && <Text className="mb-4">Log a few foods first — they become available here as ingredients.</Text>}
            {pantry.map(food => <Pressable key={food.key} accessibilityRole="button" accessibilityLabel={food.name} onPress={() => add(food)}
              weight="subtle" className="mb-2 rounded-2xl bg-surface px-4 py-3">
              <Text className="font-bold" numberOfLines={1}>{food.name}</Text>
              <Text className="text-sm">{Math.round(food.macros.caloriesKcal)} kcal{food.servingLabel ? ` per ${food.servingLabel}` : ''}</Text>
            </Pressable>)}
            <Action secondary label="Close" onPress={() => setPicking(false)} />
          </ScrollView></SafeAreaView>
        </Modal>}
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
