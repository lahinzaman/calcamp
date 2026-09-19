import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text, TextInput } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Action, Choice, Field } from '../../components/FormControls';
import { MAX_EXERCISE_NOTE } from '../../types/workout';
import { ProgressBar } from '../../theme/motion';
import { haptic } from '../../theme/haptics';
import { useT } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { exerciseById } from './catalog';
import { ExerciseHelp } from './ExerciseHelp';
import { ExercisePicker } from './ExercisePicker';
import { CustomExerciseSheet } from './CustomExerciseSheet';
import { ExercisePickerSheet } from './ExercisePickerSheet';
import { archiveOwnExercise, saveOwnExercise } from '../sync/runtime';
import { fromCatalogExercise, type CustomExercise } from '../../api/customExercises';
import { canMoveRoutineExercise, clearRoutineSuperset, defaultRoutineExercise, groupRoutineSuperset,
  moveRoutineExercise, pruneRoutineSupersets, replaceRoutineExercise, routineSupersets, setRoutineNote,
  validateRoutine, REST_CHOICES, type WorkoutRoutine } from './routines';
import { supersetLabel, SUPERSET_LIMIT } from './supersets';
import { EXPERIENCE_LEVELS, EXPERIENCE_NOTES, MUSCLE_LABELS, WEEKLY_SET_TARGETS, volumeAdvice, weeklyVolume, type ExperienceLevel, type RoutineExercise } from './volume';
import { readExperience, writeExperience } from './experience';
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-0000-4000-8000-000000000000`.slice(0, 36);
const restLabel = (seconds: number) => seconds >= 60 ? `${Math.round(seconds / 60 * 10) / 10} min` : `${seconds}s`;

function Stepper({ label, value, onChange, min, max, step = 1, asRest = false }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; asRest?: boolean }) {
  return <View className="flex-1">
    <Text className="mb-1 text-xs">{label}</Text>
    <View className="flex-row items-center gap-2">
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} disabled={value <= min} weight="firm"
        onPress={() => { onChange(Math.max(min, value - step)); haptic('selection'); }}
        className="h-10 w-10 items-center justify-center rounded-full bg-raised"><Text className="font-bold">−</Text></Pressable>
      <Text className="flex-1 text-center font-bold">{asRest ? restLabel(value) : value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} disabled={value >= max} weight="firm"
        onPress={() => { onChange(Math.min(max, value + step)); haptic('selection'); }}
        className="h-10 w-10 items-center justify-center rounded-full bg-raised"><Text className="font-bold">+</Text></Pressable>
    </View>
  </View>;
}

export function RoutineBuilder({ onClose, onSave, existing }: { onClose: () => void; onSave: (routine: WorkoutRoutine) => Promise<void>; existing?: WorkoutRoutine }) {
  const t = useT();
  const owner = useAuthStore(s => s.session?.user.id) ?? 'anonymous';
  const [step, setStep] = useState<'pick' | 'tune'>(existing ? 'tune' : 'pick');
  const [name, setName] = useState(existing?.name ?? '');
  const [entries, setEntries] = useState<RoutineExercise[]>(existing?.exercises ?? existing?.exerciseIds.map(defaultRoutineExercise) ?? []);
  const [timesPerWeek, setTimesPerWeek] = useState(existing?.timesPerWeek ?? 2);
  const [experience, setExperience] = useState<ExperienceLevel>(() => readExperience(owner));
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState<true | CustomExercise | null>(null);
  const [pairing, setPairing] = useState<string[]>([]);
  /** The slot being swapped, if any. The plan stays; only the lift filling it changes. */
  const [replacing, setReplacing] = useState<string | null>(null);
  const apply = (change: (current: RoutineExercise[]) => RoutineExercise[]) => {
    try { setEntries(current => change(current)); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'That change could not be applied.'); haptic('error'); }
  };
  const ids = entries.map(entry => entry.exerciseId);
  const [low, high] = WEEKLY_SET_TARGETS[experience];
  const volume = useMemo(() => weeklyVolume([{ exercises: entries, timesPerWeek }], experience), [entries, timesPerWeek, experience]);
  const advice = useMemo(() => volumeAdvice(volume, experience), [volume, experience]);
  const groups = useMemo(() => routineSupersets(entries), [entries]);
  // A muscle only assisted is still trained, and leaving it off the list is what made a
  // pressing-heavy routine look like it never touched the triceps.
  const trained = volume.filter(entry => entry.effectiveSets > 0);

  const toggle = (id: string) => {
    setEntries(current => current.some(entry => entry.exerciseId === id)
      ? pruneRoutineSupersets(current.filter(entry => entry.exerciseId !== id))
      : current.length < 30 ? [...current, defaultRoutineExercise(id)] : current);
    haptic('selection');
  };
  const update = (id: string, patch: Partial<RoutineExercise>) =>
    setEntries(current => current.map(entry => entry.exerciseId === id ? { ...entry, ...patch } : entry));

  const save = async () => {
    if (busy) return; setBusy(true); setError(null);
    const routine: WorkoutRoutine = { id: existing?.id ?? newId(), name: name.trim(), exerciseIds: ids, exercises: entries, timesPerWeek };
    try {
      validateRoutine(routine);
      writeExperience(owner, experience);
      await onSave(routine); haptic('success'); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This routine could not be saved.'); haptic('error'); }
    finally { setBusy(false); }
  };

  if (step === 'pick') {
    return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-background">
        <View className="px-5 pt-4">
          <Text className="text-2xl font-bold">{t('train.chooseExercises')}</Text>
          <Text className="mt-1 text-sm">Search or filter down to what your gym actually has. Sets and rest come next.</Text>
        </View>
        <ExercisePicker selectedIds={ids} onToggle={toggle} onClose={onClose} onCreate={() => setCreating(true)} onEdit={exercise => setCreating(fromCatalogExercise(exercise))} footer={<>
          <Action label={ids.length ? `Set up ${ids.length} exercise${ids.length > 1 ? 's' : ''}` : 'Pick at least one exercise'}
            disabled={!ids.length} onPress={() => setStep('tune')} tone={ids.length ? 'success' : 'none'} />
          <Action secondary label={t('common.cancel')} onPress={onClose} />
        </>} />
      </SafeAreaView>
      {creating && <CustomExerciseSheet existing={creating === true ? undefined : creating}
        onClose={() => setCreating(null)} onArchive={archiveOwnExercise}
        onSave={exercise => { const saved = saveOwnExercise(exercise); toggle(saved.id); return saved; }} />}
    </Modal>;
  }

  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text className="mb-4 text-3xl font-bold">{existing ? 'Edit routine' : 'Set up your routine'}</Text>
        <Field label="Routine name" value={name} onChangeText={setName} maxLength={80} placeholder="Push A" />

        <Text className="mb-2 mt-2 font-bold">How experienced are you?</Text>
        <View className="flex-row flex-wrap">{EXPERIENCE_LEVELS.map(level => <Choice key={level} label={level[0].toUpperCase() + level.slice(1)}
          selected={experience === level} onPress={() => setExperience(level)} />)}</View>
        <Text className="mb-4 text-sm">{EXPERIENCE_NOTES[experience]}</Text>

        <Text className="mb-2 font-bold">How often will you run this routine?</Text>
        <View className="mb-5 flex-row flex-wrap">{[1, 2, 3, 4].map(value => <Choice key={value} label={`${value}× a week`}
          selected={timesPerWeek === value} onPress={() => setTimesPerWeek(value)} />)}</View>

        {entries.map(entry => {
          const exercise = exerciseById(entry.exerciseId);
          return <View key={entry.exerciseId} className="mb-3 rounded-2xl border border-border bg-surface p-4">
            <View className="mb-3 flex-row items-center gap-3">
              <View className="flex-1"><Text className="font-bold">{exercise?.name ?? 'Exercise'}</Text>
                <Text className="text-sm">{MUSCLE_LABELS[exercise?.primaryMuscle ?? ''] ?? exercise?.primaryMuscle}
                  {entry.supersetId ? ` · superset ${supersetLabel(groups.findIndex(group => group.id === entry.supersetId))}` : ''}</Text></View>
              {exercise && <ExerciseHelp exercise={exercise} />}
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${exercise?.name ?? 'exercise'}`} tone="warning" weight="subtle"
                onPress={() => apply(current => pruneRoutineSupersets(current.filter(item => item.exerciseId !== entry.exerciseId)))}
                className="h-10 w-10 items-center justify-center rounded-full bg-raised"><Text>×</Text></Pressable>
            </View>
            {/* Up and down rather than drag, as in the live session: a drag handle inside a
                scrolling sheet fights the scroll, and these work with a screen reader. Moving a
                supersetted exercise past its partner reorders the pair; past anything else it
                takes the pair with it, so a reorder can never split a group. */}
            <View className="mb-3 flex-row items-center gap-2">
              {([['earlier', -1], ['later', 1]] as const).map(([word, delta]) => {
                const possible = canMoveRoutineExercise(entries, entry.exerciseId, delta);
                return <Pressable key={word} accessibilityRole="button" disabled={!possible}
                  accessibilityLabel={`Move ${exercise?.name ?? 'exercise'} ${word}`}
                  onPress={() => { apply(current => moveRoutineExercise(current, entry.exerciseId, delta)); haptic('selection'); }}
                  weight="subtle" style={possible ? undefined : { opacity: .3 }}
                  className="h-11 w-11 items-center justify-center rounded-full bg-raised">
                  <Text className="text-lg font-bold">{delta === -1 ? '↑' : '↓'}</Text></Pressable>;
              })}
              <Pressable accessibilityRole="button" accessibilityLabel={`Replace ${exercise?.name ?? 'exercise'}`}
                onPress={() => setReplacing(entry.exerciseId)} weight="subtle"
                className="min-h-11 justify-center rounded-full bg-raised px-4"><Text className="text-sm font-semibold">Replace</Text></Pressable>
            </View>
            <View className="flex-row gap-3">
              <Stepper label="Sets" value={entry.sets} min={1} max={20} onChange={sets => update(entry.exerciseId, { sets })} />
              <Stepper label="Rest" value={entry.restSeconds} min={0} max={600} step={15} asRest onChange={restSeconds => update(entry.exerciseId, { restSeconds })} />
            </View>
            <View className="mt-3 flex-row gap-3">
              <Stepper label="Min reps" value={entry.repLow} min={1} max={entry.repHigh} onChange={repLow => update(entry.exerciseId, { repLow })} />
              <Stepper label="Max reps" value={entry.repHigh} min={entry.repLow} max={100} onChange={repHigh => update(entry.exerciseId, { repHigh })} />
            </View>
            <View className="mt-3 flex-row flex-wrap">{REST_CHOICES.map(value => <Choice key={value} label={restLabel(value)}
              selected={entry.restSeconds === value} onPress={() => update(entry.exerciseId, { restSeconds: value })} />)}</View>
            {/* A standing note. It fills in each time you run this routine, where it becomes that
                session's own note — so changing it mid-workout records that day, not the plan. */}
            <TextInput accessibilityLabel={`Note for ${exercise?.name ?? 'exercise'}`} value={entry.note ?? ''}
              onChangeText={value => apply(current => setRoutineNote(current, entry.exerciseId, value))}
              multiline maxLength={MAX_EXERCISE_NOTE} placeholder="Seat 4, pin 7, left side lagging…"
              className="mt-3 min-h-12 rounded-xl border border-border bg-background px-3 py-2 text-sm text-ink" />
          </View>;
        })}
        <Action secondary label="Add more exercises" onPress={() => setStep('pick')} />

        {entries.length > 1 && <View className="my-4 rounded-3xl border border-border bg-surface p-5">
          <Text className="mb-1 text-sm font-bold tracking-widest">SUPERSETS</Text>
          <Text className="mb-3 text-sm">Pair exercises you do back to back. Saved with the routine, so every session that runs it starts already paired — the rest timer waits for the round, and finishing a set takes you to the partner.</Text>
          {groups.map((group, index) => <View key={group.id} className="mb-2 rounded-2xl border border-accent p-3">
            <View className="mb-1 flex-row items-center justify-between gap-3">
              <Text className="flex-1 font-bold">Superset {supersetLabel(index)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Break up superset ${supersetLabel(index)}`} weight="subtle"
                onPress={() => { setEntries(current => clearRoutineSuperset(current, group.id)); haptic('warning'); }}
                className="min-h-11 justify-center rounded-full bg-raised px-4"><Text className="text-sm font-semibold">Break up</Text></Pressable>
            </View>
            {group.exerciseIds.map(id => <Text key={id} className="text-sm">· {exerciseById(id)?.name ?? 'Exercise'}</Text>)}
          </View>)}
          <Text className="mb-2 mt-2 text-sm">Pick two to {SUPERSET_LIMIT} to pair. They move together in the order below, because that is what doing them back to back means.</Text>
          <View className="flex-row flex-wrap">{entries.map(entry => <Choice key={entry.exerciseId}
            label={exerciseById(entry.exerciseId)?.name ?? 'Exercise'} selected={pairing.includes(entry.exerciseId)}
            onPress={() => setPairing(current => current.includes(entry.exerciseId)
              ? current.filter(id => id !== entry.exerciseId)
              : current.length < SUPERSET_LIMIT ? [...current, entry.exerciseId] : current)} />)}</View>
          <Action label={pairing.length < 2 ? 'Pick at least two' : `Superset these ${pairing.length}`}
            disabled={pairing.length < 2} tone={pairing.length >= 2 ? 'success' : 'none'}
            onPress={() => {
              try { setEntries(current => groupRoutineSuperset(current, pairing, newId())); setPairing([]); setError(null); haptic('success'); }
              catch (cause) { setError(cause instanceof Error ? cause.message : 'Those exercises could not be paired.'); haptic('error'); }
            }} />
        </View>}

        <View className="my-4 rounded-3xl border border-border bg-surface p-5">
          <Text className="mb-1 text-sm font-bold tracking-widest">WEEKLY VOLUME</Text>
          <Text className="mb-3 text-sm">Target {low}–{high} hard sets per muscle, each trained at least twice a week. Muscles an exercise only works partially are listed under each bar, but the target is met with direct sets.</Text>
          {trained.map(entry => <View key={entry.muscle} className="mb-3">
            <View className="mb-1 flex-row justify-between gap-3">
              <Text className="flex-1 text-sm">{entry.label}{entry.frequencyOk ? '' : ' · once a week'}</Text>
              <Text className="text-sm font-bold">{entry.sets} sets</Text>
            </View>
            <ProgressBar value={Math.min(entry.sets, high)} target={high} height={6}
              tone={entry.status === 'in-range' ? 'protein' : entry.status === 'over' ? 'fat' : 'carbs'} />
            {/* Where the number came from, so half-credit from assisting never passes for direct work. */}
            {entry.partialSets > 0 && <Text className="mt-1 text-xs">
              {entry.sets > 0 ? 'Also ' : 'Only assisting · '}{entry.partialSets} partial {entry.partialSets === 1 ? 'set' : 'sets'} from other exercises
            </Text>}
          </View>)}
          {advice.map((item, index) => <Text key={index} className={item.tone === 'good' ? 'mt-2 text-sm font-bold' : 'mt-2 text-sm'}>{item.text}</Text>)}
        </View>

        {error && <Text accessibilityRole="alert" className="mb-4">{error}</Text>}
        <Action label={busy ? 'Saving…' : 'Save routine'} disabled={busy} onPress={() => void save()} tone="success" />
        <Action secondary label={t('common.cancel')} onPress={onClose} />
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
    {replacing && <ExercisePickerSheet
      title="Replace this exercise"
      subtitle={`${exerciseById(replacing)?.name ?? 'This exercise'} keeps its sets, rest, rep range and its place in the routine.`}
      confirmLabel={exercise => `Swap in ${exercise.name}`} onClose={() => setReplacing(null)}
      onChoose={exercise => apply(current => replaceRoutineExercise(current, replacing, exercise.id))} />}
  </Modal>;
}
