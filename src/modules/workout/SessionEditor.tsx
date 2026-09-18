import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { Text, TextInput } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { Action, Field } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { MAX_EXERCISE_NOTE } from '../../store/workoutStore';
import { ExercisePickerSheet } from './ExercisePickerSheet';
import { sessionVolume } from './history';
import { isHardSet, SET_KIND_LABELS, SET_KIND_MARKS, SET_KINDS, SET_SHAPES, trackingTypeOf } from './setShape';
import * as draftOps from './editDraft';
import type { CompletedWorkout, TrackingType, WorkoutSet } from '../../types/workout';

// A column the exercise does not have is simply absent from `fields`, so both of these have to
// cope with undefined rather than assuming every set carries every measurement.
const number = (value: string | undefined) => value?.trim() ? Number(value) : null;
const text = (value: number | null | undefined) => value === null || value === undefined ? '' : String(value);
const when = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

function SetRow({ entry, index, trackingType, onChange, onRemove }: {
  entry: WorkoutSet; index: number; trackingType: TrackingType;
  onChange: (edit: draftOps.SetEdit) => void; onRemove: () => void;
}) {
  const shape = SET_SHAPES[trackingType];
  const columns = ([
    { key: 'weightLbs', need: shape.weight, name: 'Weight lbs', label: 'lbs', keyboard: 'decimal-pad' as const },
    { key: 'reps', need: shape.reps, name: 'Reps', label: 'Reps', keyboard: 'number-pad' as const },
    { key: 'durationSeconds', need: shape.duration, name: 'Seconds', label: 'Secs', keyboard: 'number-pad' as const },
    { key: 'distanceMeters', need: shape.distance, name: 'Metres', label: 'Metres', keyboard: 'decimal-pad' as const },
    { key: 'rpe', need: 'optional' as const, name: 'RPE', label: 'RPE', keyboard: 'decimal-pad' as const },
  ] as const).filter(column => column.need !== 'none');
  const [fields, setFields] = useState<Record<string, string>>(
    () => Object.fromEntries(columns.map(column => [column.key, text(entry[column.key])])));
  const [kindOpen, setKindOpen] = useState(false);
  const edit: draftOps.SetEdit = {
    weightLbs: number(fields.weightLbs), reps: number(fields.reps), rpe: number(fields.rpe),
    durationSeconds: number(fields.durationSeconds), distanceMeters: number(fields.distanceMeters), kind: entry.kind,
  };
  const problem = draftOps.validateSetEdit(edit, trackingType);
  // Typed text stays visible while it is being typed; only a valid row reaches the draft.
  const update = (key: string, value: string) => {
    const next = { ...fields, [key]: value };
    setFields(next);
    const candidate: draftOps.SetEdit = {
      weightLbs: number(next.weightLbs), reps: number(next.reps), rpe: number(next.rpe),
      durationSeconds: number(next.durationSeconds), distanceMeters: number(next.distanceMeters), kind: entry.kind,
    };
    if (!draftOps.validateSetEdit(candidate, trackingType)) onChange(candidate);
  };
  return <View className="mb-2 rounded-xl bg-background px-2 py-3">
    <View className="flex-row items-center gap-2">
      <Pressable accessibilityRole="button" accessibilityLabel={`Set ${index + 1} type, ${SET_KIND_LABELS[entry.kind]}`}
        onPress={() => setKindOpen(open => !open)} weight="subtle" className="mt-4 h-10 w-7 items-center justify-center">
        <Text className="text-center font-bold">{SET_KIND_MARKS[entry.kind] || index + 1}</Text></Pressable>
      {columns.map(column => <View key={column.key} style={{ flex: 1 }}>
        <Text className="mb-1 text-xs">{column.label}</Text>
        <TextInput accessibilityLabel={`${column.name} set ${index + 1}`}
          value={fields[column.key] ?? ''} onChangeText={value => update(column.key, value)} placeholder="—" selectTextOnFocus
          keyboardType={column.keyboard}
          className="min-h-12 rounded-lg border border-border bg-surface px-1 py-2 text-center font-semibold text-ink" />
      </View>)}
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove set ${index + 1}`} onPress={onRemove}
        weight="subtle" className="mt-4 min-h-12 justify-center px-2"><Text className="text-lg">×</Text></Pressable>
    </View>
    {kindOpen && <View className="mt-2 flex-row flex-wrap">
      {SET_KINDS.map(kind => <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ checked: entry.kind === kind }}
        accessibilityLabel={`${SET_KIND_LABELS[kind]} set ${index + 1}`} weight="subtle"
        onPress={() => { onChange({ ...edit, kind }); setKindOpen(false); }}
        className={`mb-2 mr-2 min-h-11 justify-center rounded-full px-4 ${entry.kind === kind ? 'bg-accent' : 'bg-raised'}`}>
        <Text className="text-sm font-semibold">{SET_KIND_LABELS[kind]}</Text></Pressable>)}
    </View>}
    {problem && <Text accessibilityRole="alert" className="mt-1 pl-1 text-xs">{problem}</Text>}
  </View>;
}

/**
 * A finished session, reopened. Everything the live logger can change, this can change too —
 * which sets you did, what they weighed, what you want to remember about them — because the
 * point of writing a workout down is that it says what happened, and what happened is sometimes
 * only clear afterwards.
 */
export function SessionEditor({ workout, onSave, onDelete, onClose }: {
  workout: CompletedWorkout;
  onSave: (edited: CompletedWorkout) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(workout);
  const [name, setName] = useState(workout.session.name);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const apply = (change: (current: CompletedWorkout) => CompletedWorkout) => {
    try { setDraft(change); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'That change could not be applied.'); }
  };
  const volume = useMemo(() => sessionVolume(draft), [draft]);
  const problem = draftOps.validateDraft({ ...draft, session: { ...draft.session, name } });

  const save = () => {
    try {
      const named = draftOps.rename(draft, name);
      const blocker = draftOps.validateDraft(named);
      if (blocker) { setError(blocker); haptic('error'); return; }
      onSave(named); haptic('success'); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This session could not be saved.'); haptic('error'); }
  };

  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text className="text-sm">{when(draft.session.startedAtMs)}</Text>
        <Text className="mb-4 mt-1 text-3xl font-bold">Edit this session</Text>
        <Field label="Session name" value={name} onChangeText={setName} maxLength={80} placeholder="Upper A" />
        <Text className="mb-5 text-sm">{Math.round(volume).toLocaleString()} lbs moved · {draft.sets.filter(isHardSet).length} hard sets.
          {' '}Changing a set here updates your bests, your volume trend and the previous column.</Text>

        {draft.exercises.map(slot => {
          const sets = draft.sets.filter(entry => entry.sessionExerciseId === slot.id);
          return <View key={slot.id} className="mb-4 rounded-3xl border border-border bg-surface p-4">
            <View className="mb-2 flex-row items-center gap-3">
              <Text className="flex-1 text-lg font-bold">{slot.exercise.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${slot.exercise.name}`} tone="warning" weight="subtle"
                onPress={() => apply(current => draftOps.removeExercise(current, slot.id))}
                className="min-h-11 justify-center rounded-full bg-raised px-4"><Text className="text-sm font-semibold">Remove</Text></Pressable>
            </View>
            {sets.map((entry, index) => <SetRow key={entry.id} entry={entry} index={index} trackingType={trackingTypeOf(slot.exercise)}
              onChange={edit => apply(current => draftOps.editSet(current, entry.id, edit))}
              onRemove={() => apply(current => draftOps.removeSet(current, entry.id))} />)}
            <Pressable accessibilityRole="button" accessibilityLabel={`Add a set to ${slot.exercise.name}`}
              onPress={() => apply(current => draftOps.addSet(current, slot.id))} weight="subtle"
              className="min-h-11 justify-center rounded-xl bg-raised px-4"><Text className="text-sm font-semibold">＋ Add a set</Text></Pressable>
            <TextInput accessibilityLabel={`Note for ${slot.exercise.name}`} value={slot.note ?? ''}
              onChangeText={value => apply(current => draftOps.setNote(current, slot.id, value))}
              multiline maxLength={MAX_EXERCISE_NOTE} placeholder="Seat 4, pin 7, left side lagging…"
              className="mt-3 min-h-12 rounded-xl border border-border bg-background px-3 py-2 text-sm text-ink" />
          </View>;
        })}

        <Action secondary label="Add an exercise" onPress={() => setAdding(true)} />
        {(error || problem) && <Text accessibilityRole="alert" className="my-3 text-sm">{error ?? problem}</Text>}
        <Action label="Save changes" disabled={!!problem} tone="success" onPress={save} />
        <Action secondary label="Cancel" onPress={onClose} />

        <View className="mt-8 rounded-3xl border border-border p-5">
          <Text className="font-bold">Delete this session</Text>
          <Text className="mt-2 text-sm">It goes from this device and from your account, and the volume and bests it contributed are recalculated without it. This cannot be undone.</Text>
          {confirmDelete
            ? <View className="mt-3 gap-2">
                <Action label="Yes, delete it" onPress={() => { onDelete(); haptic('warning'); onClose(); }} />
                <Action secondary label="Keep it" onPress={() => setConfirmDelete(false)} />
              </View>
            : <Pressable accessibilityRole="button" accessibilityLabel="Delete this session" tone="warning" weight="subtle"
                onPress={() => setConfirmDelete(true)} className="mt-3 min-h-12 justify-center rounded-xl bg-raised px-4">
                <Text className="font-semibold">Delete session</Text></Pressable>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
    {adding && <ExercisePickerSheet title="Add an exercise" subtitle="Something you did in this session but never logged."
      confirmLabel={exercise => `Add ${exercise.name}`} onClose={() => setAdding(false)}
      onChoose={exercise => apply(current => draftOps.addExercise(current, exercise))} />}
  </Modal>;
}
