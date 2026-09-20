import { useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { Action, Choice, Field } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { CORE_MUSCLES, MUSCLE_LABELS } from './volume';
import { PATTERN_LABELS, patternLabel } from './search';
import { SET_SHAPES, TRACKING_TYPES } from './setShape';
import { REST_CHOICES, DEFAULT_REST_SECONDS } from './routines';
import { EQUIPMENT_CHOICES, MAX_CUSTOM_NAME, type CustomExercise } from '../../api/customExercises';
import type { CatalogExercise } from './catalog';

/**
 * expo-crypto, not `globalThis.crypto`. There is no `crypto` global in this runtime, so that
 * optional chain always fell through to a hand-assembled string whose hyphens sit in the wrong
 * places. It is 36 characters of hex and hyphens, which looked close enough to pass validation,
 * and Postgres rejected every one with a 22P02 — an error the sync queue treats as permanent.
 * Routines and exercises made that way never left the device.
 */
const newId = () => randomUUID();
const restLabel = (seconds: number) => seconds >= 60 ? `${Math.round(seconds / 60 * 10) / 10} min` : `${seconds}s`;
/** Accessory muscles come after the ones a balanced week is judged on, which is how they read. */
const MUSCLES = [...CORE_MUSCLES, ...Object.keys(MUSCLE_LABELS).filter(muscle => !CORE_MUSCLES.includes(muscle as never))];

/**
 * The lift your gym has that nobody else's does. Everything asked for here has a job: the
 * muscle decides which weekly total the sets land in, the movement is what routes assisting
 * work to the triceps in a press, and how it is measured decides whether the set asks for
 * weight and reps or for a stopwatch.
 */
export function CustomExerciseSheet({ existing, onSave, onArchive, onClose }: {
  existing?: CustomExercise;
  onSave: (exercise: CustomExercise) => CatalogExercise | void;
  /** Archives rather than deletes: sets point at exercises, and that history really happened. */
  onArchive?: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CustomExercise>(() => existing ?? {
    id: newId(), name: '', primaryMuscle: 'chest', movementPattern: 'horizontal_push',
    equipment: 'machine', trackingType: 'weight_reps', defaultRestSeconds: DEFAULT_REST_SECONDS,
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const set = <K extends keyof CustomExercise>(key: K, value: CustomExercise[K]) =>
    setDraft(current => ({ ...current, [key]: value }));

  const save = () => {
    try { onSave(draft); haptic('success'); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This exercise could not be saved.'); haptic('error'); }
  };

  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text className="text-3xl font-bold">{existing ? 'Edit your exercise' : 'Create an exercise'}</Text>
        <Text className="mb-5 mt-2 text-sm">For the machine your gym has that the catalogue does not. It behaves like any other lift: routines, volume, bests and history all work the same.</Text>

        <Field label="Name" value={draft.name} onChangeText={value => set('name', value)}
          maxLength={MAX_CUSTOM_NAME} placeholder="Hammer Strength Iso Row" />

        <Text className="mb-2 mt-4 font-bold">Which muscle does it train?</Text>
        <Text className="mb-2 text-sm">This is the muscle its sets count toward in your weekly volume.</Text>
        <View className="flex-row flex-wrap">{MUSCLES.map(muscle => <Choice key={muscle} label={MUSCLE_LABELS[muscle]}
          selected={draft.primaryMuscle === muscle} onPress={() => set('primaryMuscle', muscle)} />)}</View>

        <Text className="mb-2 mt-4 font-bold">What movement is it?</Text>
        <Text className="mb-2 text-sm">Assisting work is worked out from this — a horizontal press credits the triceps and front delts without you listing them.</Text>
        <View className="flex-row flex-wrap">{Object.keys(PATTERN_LABELS).map(pattern => <Choice key={pattern} label={patternLabel(pattern)}
          selected={draft.movementPattern === pattern} onPress={() => set('movementPattern', pattern)} />)}</View>

        <Text className="mb-2 mt-4 font-bold">Equipment</Text>
        <View className="flex-row flex-wrap">{EQUIPMENT_CHOICES.map(equipment => <Choice key={equipment}
          label={equipment[0].toUpperCase() + equipment.slice(1)}
          selected={draft.equipment === equipment} onPress={() => set('equipment', equipment)} />)}</View>

        <Text className="mb-2 mt-4 font-bold">How is a set measured?</Text>
        <View className="flex-row flex-wrap">{TRACKING_TYPES.map(type => <Choice key={type} label={SET_SHAPES[type].label}
          selected={draft.trackingType === type} onPress={() => set('trackingType', type)} />)}</View>
        <Text className="mb-2 mt-1 text-sm">
          {draft.trackingType === 'weight_reps' ? 'Weight and reps, and it counts toward the pounds you move.'
            : draft.trackingType === 'bodyweight_reps' ? 'Reps, with any weight you add optional. Your own body mass is never counted as load.'
            : draft.trackingType === 'duration' ? 'Seconds held. It counts as a hard set, but not toward pounds moved.'
            : 'Distance, with time optional. It counts as a hard set, but not toward pounds moved.'}
        </Text>

        <Text className="mb-2 mt-4 font-bold">Default rest</Text>
        <View className="flex-row flex-wrap">{REST_CHOICES.map(value => <Choice key={value} label={restLabel(value)}
          selected={draft.defaultRestSeconds === value} onPress={() => set('defaultRestSeconds', value)} />)}</View>

        <View className="mt-4">
          <Field label="Anything to remember (optional)" value={draft.notes ?? ''} onChangeText={value => set('notes', value)}
            maxLength={280} placeholder="Second machine from the window; pin 7 is my working weight." />
        </View>

        {error && <Text accessibilityRole="alert" className="my-3 text-sm">{error}</Text>}
        <View className="mt-4">
          <Action label={existing ? 'Save changes' : 'Create exercise'} tone="success" onPress={save} />
          <Action secondary label="Cancel" onPress={onClose} />
        </View>

        {existing && onArchive && <View className="mt-8 rounded-3xl border border-border p-5">
          <Text className="font-bold">Remove from your list</Text>
          <Text className="mt-2 text-sm">It stops appearing when you pick exercises. Sessions you already did with it keep it, and the sets you logged are untouched — this hides it, it does not erase it.</Text>
          {confirmArchive
            ? <View className="mt-3 gap-2">
                <Action label="Yes, remove it" onPress={() => { onArchive(existing.id); haptic('warning'); onClose(); }} />
                <Action secondary label="Keep it" onPress={() => setConfirmArchive(false)} />
              </View>
            : <Pressable accessibilityRole="button" accessibilityLabel="Remove this exercise from your list" tone="warning" weight="subtle"
                onPress={() => setConfirmArchive(true)} className="mt-3 min-h-12 justify-center rounded-xl bg-raised px-4">
                <Text className="font-semibold">Remove exercise</Text></Pressable>}
        </View>}
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
