import { Pressable, Text, View } from 'react-native';
import { nutritionStore, useNutritionStore } from '../store/nutritionStore';
export function CloudDiaryControls() {
  const status = useNutritionStore(s => s.syncStatus);
  const error = useNutritionStore(s => s.syncError);
  const busy = status === 'loading' || status === 'saving';
  return <View className="mb-5 rounded-2xl bg-white p-4">
    <View className="flex-row gap-3">
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void nutritionStore.getState().loadToday()} className="flex-1 rounded-xl bg-zinc-100 p-3"><Text className="text-center text-sm font-semibold">Load cloud diary</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void nutritionStore.getState().saveToday()} className="flex-1 rounded-xl bg-zinc-950 p-3"><Text className="text-center text-sm font-semibold text-white">{busy ? 'Syncing…' : 'Save diary'}</Text></Pressable>
    </View>
    {status === 'saved' && <Text className="mt-2 text-xs text-emerald-700">Diary synced with Supabase.</Text>}
    {error && <Text accessibilityRole="alert" className="mt-2 text-xs text-scarlet">{error}</Text>}
  </View>;
}
