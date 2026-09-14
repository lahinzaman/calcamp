import { View } from 'react-native';
import { Text } from '../theme/primitives';
import { Pressable } from '../theme/Pressable';
import { Pop, ProgressBar, Reveal } from '../theme/motion';
import { haptic } from '../theme/haptics';
import { confirmToast } from './Toast';
import { nutritionStore, useNutritionStore } from '../store/nutritionStore';
const CUP_OZ = 8;
const CUP_G = 236.588;
const TARGET_CUPS = 8;
const NAME = 'Water';
/** Water rides the normal entry pipeline, so it syncs, appears in history, and can be undone. */
export function WaterTracker() {
  const entries = useNutritionStore(s => s.entries);
  const cups = entries.filter(entry => entry.name === NAME).reduce((sum, entry) => sum + entry.servings, 0);
  const add = () => {
    nutritionStore.getState().addEntry({ name: NAME, servings: 1, servingLabel: `${CUP_OZ} oz`, source: 'quick',
      referenceMacros: { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }, referenceMicros: { water_g: CUP_G } });
    confirmToast(`Water logged · ${cups + 1} ${cups + 1 === 1 ? 'cup' : 'cups'} today`);
    haptic('light');
  };
  const removeOne = () => {
    const last = [...entries].reverse().find(entry => entry.name === NAME);
    if (!last) return;
    if (last.servings > 1) nutritionStore.getState().updateEntry(last.id, { servings: last.servings - 1 });
    else nutritionStore.getState().removeEntry(last.id);
    haptic('warning');
  };
  return <Reveal index={1}><View className="mb-5 rounded-3xl border border-border bg-surface p-5">
    <View className="mb-3 flex-row items-baseline justify-between">
      <Text className="text-sm font-bold tracking-widest">WATER</Text>
      <Text className="text-sm">{Math.round(cups * CUP_OZ)} oz of {TARGET_CUPS * CUP_OZ} oz</Text>
    </View>
    <View className="flex-row items-center gap-4">
      <Pressable accessibilityRole="button" accessibilityLabel="Remove one cup of water" onPress={removeOne} disabled={!cups} weight="firm" tone="none"
        className="h-12 w-12 items-center justify-center rounded-full bg-raised"><Text className="text-2xl font-bold">−</Text></Pressable>
      <View className="flex-1">
        <Pop trigger={cups}><Text className="mb-2 text-3xl font-bold">{Number(cups.toFixed(1))} cups</Text></Pop>
        <ProgressBar value={cups} target={TARGET_CUPS} tone="protein" />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Add one cup of water" onPress={add} weight="firm" tone="none"
        className="h-12 w-12 items-center justify-center rounded-full bg-accent"><Text className="text-2xl font-bold">+</Text></Pressable>
    </View>
  </View></Reveal>;
}
