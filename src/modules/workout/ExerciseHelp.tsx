import { memo, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Action } from '../../components/FormControls';
import type { ExerciseDefinition } from '../../types/workout';
import { exerciseById } from './catalog';
import { muscleLabel, patternLabel } from './search';
import { secondaryMuscles } from './synergists';

/**
 * Text only. The generated stick-figure animations were never going to be good enough to
 * teach a movement, and a bad demonstration is worse than none — it invites you to copy it.
 */
export const ExerciseHelp = memo(function ExerciseHelp({ exercise }: { exercise: ExerciseDefinition }) {
  const [open, setOpen] = useState(false);
  const details = exerciseById(exercise.id);
  const partial = details ? secondaryMuscles(details) : [];
  const facts = [
    details ? muscleLabel(details.primaryMuscle) : null,
    exercise.equipment ?? details?.equipment ?? null,
    patternLabel(exercise.movementPattern ?? details?.movementPattern ?? ''),
  ].filter(Boolean) as string[];
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Help for ${exercise.name}`} onPress={() => setOpen(true)}
      className="h-12 w-12 items-center justify-center rounded-full bg-raised"><Text className="text-xl font-bold">?</Text></Pressable>
    {open && <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaView className="flex-1 bg-background"><ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
        <Text className="text-3xl font-bold">{exercise.name}</Text>
        <View className="mb-3 mt-3 flex-row flex-wrap gap-2">
          {facts.map(fact => <View key={fact} className="rounded-full bg-raised px-3 py-2"><Text className="text-sm">{fact}</Text></View>)}
        </View>
        {!!partial.length && <Text className="mb-5 text-sm">
          Also works {partial.map(muscleLabel).join(', ')} — partially, alongside the main target. Your weekly volume shows this partial work, but meeting a muscle's target still takes direct sets.
        </Text>}
        {!partial.length && details && <Text className="mb-5 text-sm">An isolation movement: it works {muscleLabel(details.primaryMuscle)} and little else.</Text>}
        <Text className="mb-5 text-lg leading-7">
          {details?.description ?? exercise.variationNotes ?? 'Follow the setup and range of motion your coach gave you for this custom variation.'}
        </Text>
        <View className="mb-6 rounded-2xl bg-surface p-5">
          <Text className="mb-2 text-sm font-bold tracking-widest">IF IN DOUBT</Text>
          <Text className="leading-6">Use a controlled range you can repeat, keep the weight light enough to finish every rep the same way, and stop if the movement hurts.</Text>
        </View>
        <Action label="Close exercise help" onPress={() => setOpen(false)} />
      </ScrollView></SafeAreaView>
    </Modal>}
  </>;
});
