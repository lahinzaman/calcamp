import { memo, useMemo, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import LottieView from 'lottie-react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Action } from '../../components/FormControls';
import type { ExerciseDefinition } from '../../types/workout';
import { exerciseById } from './catalog';
import { demonstration } from './demonstrations';
export const ExerciseHelp = memo(function ExerciseHelp({ exercise }: { exercise: ExerciseDefinition }) {
  const [open,setOpen] = useState(false); const reduced = useReducedMotion();
  const details = exerciseById(exercise.id); const animation = useMemo(() => demonstration(details?.demo ?? 'row'), [details?.demo]);
  return <><Pressable accessibilityRole="button" accessibilityLabel={`Help for ${exercise.name}`} onPress={() => setOpen(true)} className="h-12 w-12 items-center justify-center rounded-full bg-raised"><Text className="text-xl font-bold">?</Text></Pressable>
    {open && <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={() => setOpen(false)}><SafeAreaView className="flex-1 bg-background"><ScrollView contentContainerStyle={{padding:24}}><Text className="text-2xl font-bold">{exercise.name}</Text><Text className="my-3">{exercise.equipment} · {details?.primaryMuscle ?? exercise.movementPattern}</Text>
      <View className="items-center rounded-3xl bg-surface"><LottieView source={animation} autoPlay={!reduced} loop={!reduced} progress={reduced ? .5 : undefined} style={{width:260,height:260}} /></View>
      <Text className="my-3 text-sm">Movement pattern · schematic side view. Equipment and grip vary by exercise.</Text><Text className="mb-5 text-lg leading-7">{details?.description ?? exercise.variationNotes ?? 'Follow the setup and range of motion provided by your coach for this custom variation.'}</Text>
      <Text className="mb-5">Use a controlled, comfortable range. Stop if the movement hurts.</Text><Action label="Close exercise help" onPress={() => setOpen(false)} />
    </ScrollView></SafeAreaView></Modal>}
  </>;
});
