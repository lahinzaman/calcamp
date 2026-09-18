import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { Action } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { safelyEdit } from '../../components/safelyEdit';
import { workoutStore } from '../../store/workoutStore';
import { groups, supersetLabel, SUPERSET_LIMIT } from './supersets';
import type { SessionExercise } from '../../types/workout';

/**
 * Pairing exercises to do back to back. The rest timer then waits for the round rather than
 * starting between the halves, and completing a set moves you to the partner instead of the
 * next set — which is the whole difference between a superset and two exercises in a row.
 */
export function SupersetSheet({ sequence, onClose }: { sequence: readonly SessionExercise[]; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const existing = groups(sequence);
  const toggle = (id: string) => setPicked(current => current.includes(id)
    ? current.filter(item => item !== id)
    : current.length < SUPERSET_LIMIT ? [...current, id] : current);

  const create = () => safelyEdit(() => {
    workoutStore.getState().groupSuperset(picked);
    setPicked([]); haptic('success');
  });

  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-background"><ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
      <Text className="text-3xl font-bold">Supersets</Text>
      <Text className="mb-5 mt-2 text-sm">Pick two to {SUPERSET_LIMIT} exercises to do back to back. Your rest timer waits until the round is done, and finishing a set takes you straight to the next exercise in the pair.</Text>

      {existing.map((group, index) => <View key={group.id} className="mb-3 rounded-2xl border border-accent bg-surface p-4">
        <View className="mb-2 flex-row items-center justify-between gap-3">
          <Text className="flex-1 font-bold">Superset {supersetLabel(index)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Break up superset ${supersetLabel(index)}`} weight="subtle"
            onPress={() => { safelyEdit(() => workoutStore.getState().ungroupSuperset(group.id)); haptic('warning'); }}
            className="min-h-11 justify-center rounded-full bg-raised px-4"><Text className="text-sm font-semibold">Break up</Text></Pressable>
        </View>
        {group.members.map(member => <Text key={member.id} className="text-sm">· {member.exercise.name}</Text>)}
      </View>)}

      <Text className="mb-2 mt-2 text-sm font-bold tracking-widest">PAIR EXERCISES</Text>
      {sequence.map(entry => {
        const chosen = picked.includes(entry.id);
        const already = existing.findIndex(group => group.members.some(member => member.id === entry.id));
        return <Pressable key={entry.id} accessibilityRole="checkbox" accessibilityState={{ checked: chosen }}
          accessibilityLabel={entry.exercise.name} onPress={() => { toggle(entry.id); haptic('selection'); }} weight="subtle"
          className={`mb-2 rounded-2xl border p-4 ${chosen ? 'border-accent bg-raised' : 'border-border bg-surface'}`}>
          <Text className="font-semibold">{chosen ? '✓ ' : ''}{entry.exercise.name}</Text>
          {already >= 0 && <Text className="mt-0.5 text-xs">Currently in superset {supersetLabel(already)}</Text>}
        </Pressable>;
      })}

      <View className="mt-4">
        <Action label={picked.length < 2 ? 'Pick at least two exercises' : `Superset these ${picked.length}`}
          disabled={picked.length < 2} tone={picked.length >= 2 ? 'success' : 'none'} onPress={create} />
        <Action secondary label="Done" onPress={onClose} />
      </View>
    </ScrollView></SafeAreaView>
  </Modal>;
}
