import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRestCountdown } from '../../components/providers/TrackingProvider';
import { useWorkoutStore, workoutStore } from '../../store/workoutStore';
import type { WorkoutSet } from '../../types/workout';
import { estimateBrzyckiOneRepMax } from './oneRepMax';

export type PreviousSets = Record<string, { weightKg: number; reps: number }[]>;
const localId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const timerText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function SetRow({ entry, index, previous }: { entry: WorkoutSet; index: number; previous?: { weightKg: number; reps: number } }) {
  const [fields, setFields] = useState({ weightKg: entry.weightKg?.toString() ?? '', reps: entry.reps?.toString() ?? '', rpe: entry.rpe?.toString() ?? '' });
  useEffect(() => {
    setFields({ weightKg: entry.weightKg?.toString() ?? '', reps: entry.reps?.toString() ?? '', rpe: entry.rpe?.toString() ?? '' });
  }, [entry.weightKg, entry.reps, entry.rpe]);
  const weight = fields.weightKg.trim() ? Number(fields.weightKg) : null;
  const reps = fields.reps.trim() ? Number(fields.reps) : null;
  const rpe = fields.rpe.trim() ? Number(fields.rpe) : null;
  const valid = (weight === null || (Number.isFinite(weight) && weight >= 0))
    && (reps === null || (Number.isInteger(reps) && reps >= 1 && reps <= 1000))
    && (rpe === null || (Number.isFinite(rpe) && rpe >= 1 && rpe <= 10));
  const estimate = valid ? estimateBrzyckiOneRepMax(weight, reps) : null;
  const completed = entry.completedAtMs !== null;
  const update = (key: keyof typeof fields, text: string) => {
    // Keep intermediate/invalid text visible without poisoning the numeric store.
    setFields((current) => ({ ...current, [key]: text }));
  };
  useEffect(() => {
    if (valid && !completed) workoutStore.getState().updateSet(entry.id, { weightKg: weight, reps, rpe, estimatedOneRepMaxKg: estimate });
  }, [entry.id, weight, reps, rpe, estimate, valid, completed]);

  return <View className={completed ? 'mb-2 rounded-xl bg-emerald-50 px-2 py-3' : 'mb-2 rounded-xl bg-zinc-50 px-2 py-3'}>
    <View className="flex-row items-center justify-between gap-1">
      <Text className="w-6 text-center font-bold text-zinc-700">{index + 1}</Text>
      <Text className="w-[74px] text-center text-xs text-zinc-500">{previous ? `${previous.weightKg} × ${previous.reps}` : '—'}</Text>
      {(['weightKg', 'reps', 'rpe'] as const).map((key) => <TextInput
        key={key} accessibilityLabel={`${key === 'weightKg' ? 'Weight kg' : key === 'reps' ? 'Reps' : 'RPE'} set ${index + 1}`}
        value={fields[key]} editable={!completed} onChangeText={(text) => update(key, text)}
        keyboardType={key === 'reps' ? 'number-pad' : 'decimal-pad'} placeholder="—" selectTextOnFocus
        className="w-12 rounded-lg border border-zinc-200 bg-white px-1 py-2 text-center font-semibold text-zinc-950"
      />)}
      <Pressable accessibilityRole="button" accessibilityLabel={`Complete set ${index + 1}`} accessibilityState={{ disabled: completed || !valid || weight === null || reps === null, selected: completed }}
        disabled={completed || !valid || weight === null || reps === null} onPress={() => {
          workoutStore.getState().updateSet(entry.id, { weightKg: weight, reps, rpe, estimatedOneRepMaxKg: estimate });
          workoutStore.getState().completeSet(entry.id);
        }} className={completed ? 'h-9 w-9 items-center justify-center rounded-lg bg-emerald-600' : valid && weight !== null && reps !== null ? 'h-9 w-9 items-center justify-center rounded-lg bg-scarlet' : 'h-9 w-9 items-center justify-center rounded-lg bg-zinc-200'}>
        <Text className={completed || (valid && weight !== null && reps !== null) ? 'font-bold text-white' : 'font-bold text-zinc-400'}>✓</Text>
      </Pressable>
    </View>
    <Text accessibilityLiveRegion="polite" className={valid ? 'mt-2 pl-1 text-xs text-zinc-500' : 'mt-2 pl-1 text-xs text-red-700'}>
      {!valid ? 'Use kg ≥ 0, whole reps 1–1000, and RPE 1–10.' : estimate !== null ? `Estimated 1RM · ${estimate.toFixed(1)} kg` : 'Estimated 1RM · enter a loaded set of 1–12 reps'}
    </Text>
  </View>;
}

export default function ActiveWorkoutScreen({ previousSets = {} }: { previousSets?: PreviousSets }) {
  const session = useWorkoutStore((state) => state.activeSession);
  const sequence = useWorkoutStore((state) => state.exerciseSequence);
  const activeId = useWorkoutStore((state) => state.activeExerciseId);
  const sets = useWorkoutStore((state) => state.sets);
  const syncStatus = useWorkoutStore(state => state.syncStatus);
  const syncError = useWorkoutStore(state => state.syncError);
  const pending = useWorkoutStore(state => state.pendingWorkouts.length);
  const timer = useWorkoutStore((state) => state.restTimer);
  const remaining = useRestCountdown();
  const [localHistory, setLocalHistory] = useState<PreviousSets>({});
  const [finished, setFinished] = useState<string | null>(null);
  const active = sequence.find((exercise) => exercise.id === activeId);
  const currentSets = sets.filter((entry) => entry.sessionExerciseId === activeId);
  const history = active ? (localHistory[active.exercise.id] ?? previousSets[active.exercise.id] ?? []) : [];
  const volume = sets.reduce((total, entry) => total + (entry.completedAtMs !== null && !entry.isWarmup ? (entry.weightKg ?? 0) * (entry.reps ?? 0) : 0), 0);
  const start = () => {
    const actions = workoutStore.getState();
    actions.startSession({ id: localId(), name: 'Upper A' });
    for (const [catalogId, name, grip] of [
      ['10000000-0000-4000-8000-000000000001', 'High-Pronated Grip Row', 'pronated'],
      ['10000000-0000-4000-8000-000000000002', 'Neutral Grip Lat Pulldown', 'neutral'],
    ]) {
      const id = localId();
      actions.addExercise({ id, exercise: { id: catalogId, name, grip, equipment: 'cable' }, defaultRestSeconds: 90 });
      actions.addSet({ id: localId(), sessionExerciseId: id });
    }
    setFinished(null);
  };

  return <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-[#F7F7F2]">
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <View className="mb-6 flex-row justify-between"><Text className="text-sm font-black tracking-widest text-scarlet">RULOCKED</Text><Text className="text-xs font-semibold text-zinc-500">TRAINING</Text></View>
      <Text className="text-4xl font-bold tracking-tight text-zinc-950">{session?.name ?? 'Make progress.'}</Text>
      <Text className="mt-2 text-base text-zinc-500">{session ? 'One focused set at a time.' : 'Show up. Log your lifts. Build on last time.'}</Text>
      {pending > 0 && <Pressable accessibilityRole="button" disabled={syncStatus === 'saving'} onPress={() => void workoutStore.getState().savePendingWorkouts()} className="mt-4 rounded-xl bg-white p-4"><Text className="font-semibold">{syncStatus === 'saving' ? 'Saving workouts…' : `Save ${pending} pending workout(s)`}</Text></Pressable>}
      {syncError && <Text accessibilityRole="alert" className="mt-3 text-sm text-scarlet">{syncError}</Text>}
      {syncStatus === 'saved' && <Text className="mt-3 text-sm text-emerald-700">Workouts saved to Supabase.</Text>}
      {!session ? <View className="mt-8 rounded-3xl bg-zinc-950 p-6">
        <Text className="text-xs font-bold uppercase tracking-widest text-zinc-400">Ready when you are</Text>
        <Text className="mt-4 text-2xl font-bold text-white">Upper-body session</Text>
        <Text className="mt-3 leading-6 text-zinc-400">Cable row + lat pulldown. Start with an empty log and enter your own working weights.</Text>
        <Pressable accessibilityRole="button" onPress={start} className="mt-6 items-center rounded-2xl bg-scarlet p-4"><Text className="font-bold text-white">Start session</Text></Pressable>
        {finished && <Text accessibilityRole="alert" className="mt-4 text-sm text-emerald-300">{finished}</Text>}
      </View> : <>
        <View className="my-6 flex-row gap-3"><View className="flex-1 rounded-2xl bg-white p-4"><Text className="text-xs text-zinc-500">Completed sets</Text><Text className="mt-2 text-2xl font-bold text-zinc-950">{sets.filter((entry) => entry.completedAtMs !== null).length}</Text></View><View className="flex-1 rounded-2xl bg-white p-4"><Text className="text-xs text-zinc-500">Volume · kg × reps</Text><Text className="mt-2 text-2xl font-bold text-zinc-950">{Number(volume.toFixed(1))}</Text></View></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5" contentContainerStyle={{ gap: 8 }}>
          {sequence.map((entry, index) => <Pressable key={entry.id} accessibilityRole="tab" accessibilityLabel={entry.exercise.name} accessibilityState={{ selected: entry.id === activeId }} onPress={() => workoutStore.getState().setActiveExercise(entry.id)} className={entry.id === activeId ? 'rounded-xl bg-zinc-950 px-4 py-3' : 'rounded-xl bg-white px-4 py-3'}><Text className={entry.id === activeId ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-zinc-600'}>{index + 1}. {entry.exercise.name}</Text></Pressable>)}
        </ScrollView>
        {active ? <View className="rounded-3xl bg-white p-4">
          <Text className="text-xl font-bold text-zinc-950">{active.exercise.name}</Text>
          <Text className="mb-5 mt-2 text-sm text-zinc-500">{active.exercise.grip ?? 'Custom grip'} · {active.exercise.equipment ?? 'Custom exercise'} · {active.defaultRestSeconds}s rest</Text>
          <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
            <View style={{ minWidth: 330, flex: 1 }}>
              <View className="mb-3 flex-row justify-between gap-1 px-2">{(['Set', 'Previous', 'kg', 'Reps', 'RPE', 'Done'] as const).map((label, index) => <Text key={label} className="text-center text-xs font-semibold text-zinc-500" style={{ width: index === 0 ? 24 : index === 1 ? 74 : index === 5 ? 36 : 48 }}>{label}</Text>)}</View>
              {currentSets.map((entry, index) => <SetRow key={entry.id} entry={entry} index={index} previous={history[index]} />)}
            </View>
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={() => workoutStore.getState().addSet({ id: localId(), sessionExerciseId: active.id })} className="mt-3 items-center rounded-xl bg-zinc-100 p-4"><Text className="font-bold text-zinc-700">+ Add set</Text></Pressable>
        </View> : <Text className="rounded-2xl bg-white p-4 text-zinc-600">Add an exercise to this session to begin logging.</Text>}
        <View className="mt-5 rounded-3xl bg-zinc-950 p-5">
          <View className="flex-row items-center justify-between"><View><Text className="text-xs font-bold uppercase tracking-widest text-zinc-400">{timer ? 'Rest remaining' : 'Between sets'}</Text><Text testID="rest-countdown" accessibilityLiveRegion="none" className="mt-2 text-4xl font-bold tabular-nums text-white">{timer ? timerText(remaining) : 'Ready'}</Text></View>{timer && <Pressable accessibilityRole="button" onPress={() => workoutStore.getState().clearRestTimer()} className="rounded-xl bg-zinc-800 px-4 py-3"><Text className="font-semibold text-white">Skip rest</Text></Pressable>}</View>
          <Text className="mt-3 text-sm text-zinc-400">{timer ? 'Take a breath. Your next set is coming.' : 'Complete a set to start your rest timer.'}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => {
          const snapshot = workoutStore.getState().finishSession();
          const next: PreviousSets = {};
          for (const exercise of snapshot.exercises) {
            const completed = snapshot.sets.filter((entry) => entry.sessionExerciseId === exercise.id && entry.completedAtMs !== null && !entry.isWarmup);
            if (completed.length) next[exercise.exercise.id] = completed.map((entry) => ({ weightKg: entry.weightKg!, reps: entry.reps! }));
          }
          setLocalHistory((current) => ({ ...current, ...next }));
          setFinished('Session finished and queued for cloud save.');
          void workoutStore.getState().savePendingWorkouts();
        }} className="mt-6 items-center rounded-2xl border border-zinc-300 p-4"><Text className="font-bold text-zinc-700">Finish session</Text></Pressable>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
