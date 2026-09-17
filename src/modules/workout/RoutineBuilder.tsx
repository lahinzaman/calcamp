import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Action, Choice, Field } from '../../components/FormControls';
import { ProgressBar } from '../../theme/motion';
import { haptic } from '../../theme/haptics';
import { useT } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { exerciseById } from './catalog';
import { ExerciseHelp } from './ExerciseHelp';
import { ExercisePicker } from './ExercisePicker';
import { defaultRoutineExercise, validateRoutine, REST_CHOICES, type WorkoutRoutine } from './routines';
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
  const ids = entries.map(entry => entry.exerciseId);
  const [low, high] = WEEKLY_SET_TARGETS[experience];
  const volume = useMemo(() => weeklyVolume([{ exercises: entries, timesPerWeek }], experience), [entries, timesPerWeek, experience]);
  const advice = useMemo(() => volumeAdvice(volume, experience), [volume, experience]);
  // A muscle only assisted is still trained, and leaving it off the list is what made a
  // pressing-heavy routine look like it never touched the triceps.
  const trained = volume.filter(entry => entry.effectiveSets > 0);

  const toggle = (id: string) => {
    setEntries(current => current.some(entry => entry.exerciseId === id)
      ? current.filter(entry => entry.exerciseId !== id)
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
        <ExercisePicker selectedIds={ids} onToggle={toggle} onClose={onClose} footer={<>
          <Action label={ids.length ? `Set up ${ids.length} exercise${ids.length > 1 ? 's' : ''}` : 'Pick at least one exercise'}
            disabled={!ids.length} onPress={() => setStep('tune')} tone={ids.length ? 'success' : 'none'} />
          <Action secondary label={t('common.cancel')} onPress={onClose} />
        </>} />
      </SafeAreaView>
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
                <Text className="text-sm">{MUSCLE_LABELS[exercise?.primaryMuscle ?? ''] ?? exercise?.primaryMuscle}</Text></View>
              {exercise && <ExerciseHelp exercise={exercise} />}
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${exercise?.name ?? 'exercise'}`} tone="warning" weight="subtle"
                onPress={() => setEntries(current => current.filter(item => item.exerciseId !== entry.exerciseId))}
                className="h-10 w-10 items-center justify-center rounded-full bg-raised"><Text>×</Text></Pressable>
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
          </View>;
        })}
        <Action secondary label="Add more exercises" onPress={() => setStep('pick')} />

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
  </Modal>;
}
