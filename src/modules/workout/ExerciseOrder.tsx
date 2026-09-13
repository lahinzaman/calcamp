import { Modal, ScrollView, View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { Action } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { safelyEdit } from '../../components/safelyEdit';
import { workoutStore } from '../../store/workoutStore';
import { useT } from '../../i18n';
import type { SessionExercise } from '../../types/workout';

/**
 * Up and down rather than drag: a drag handle inside a scrolling sheet fights the scroll,
 * and these buttons work with a screen reader and with one thumb.
 */
export function ExerciseOrder({ sequence, onClose }: { sequence: readonly SessionExercise[]; onClose: () => void }) {
  const t = useT();
  const move = (index: number, delta: number) => {
    const next = sequence.map(entry => entry.id);
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    safelyEdit(() => workoutStore.getState().reorderExercises(next));
    haptic('selection');
  };
  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-background"><ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
      <Text className="mb-2 text-3xl font-bold">{t('train.exerciseOrder')}</Text>
      <Text className="mb-5">Move an exercise to train it sooner or later. Sets you have already logged move with it.</Text>
      {sequence.map((entry, index) => <View key={entry.id} className="mb-2 flex-row items-center gap-2 rounded-2xl bg-surface p-3">
        <Text className="w-6 text-center font-bold">{index + 1}</Text>
        <Text className="flex-1 font-semibold">{entry.exercise.name}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Move ${entry.exercise.name} earlier`} disabled={index === 0}
          onPress={() => move(index, -1)} weight="subtle" style={index === 0 ? { opacity: .3 } : undefined}
          className="h-11 w-11 items-center justify-center rounded-full bg-raised"><Text className="text-lg font-bold">↑</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Move ${entry.exercise.name} later`} disabled={index === sequence.length - 1}
          onPress={() => move(index, 1)} weight="subtle" style={index === sequence.length - 1 ? { opacity: .3 } : undefined}
          className="h-11 w-11 items-center justify-center rounded-full bg-raised"><Text className="text-lg font-bold">↓</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${entry.exercise.name}`} tone="warning" weight="subtle"
          onPress={() => { safelyEdit(() => workoutStore.getState().removeExercise(entry.id)); haptic('warning'); }}
          className="h-11 w-11 items-center justify-center rounded-full bg-raised"><Text className="text-lg font-bold">×</Text></Pressable>
      </View>)}
      {!sequence.length && <Text>This session has no exercises left.</Text>}
      <View className="mt-4"><Action label={t('common.done')} onPress={onClose} /></View>
    </ScrollView></SafeAreaView>
  </Modal>;
}
