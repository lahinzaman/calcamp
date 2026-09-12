import { RoutineBuilder } from './RoutineBuilder';
import { SessionTimer } from './SessionTimer';
import { routineExercises } from './routines';
import { haptic } from '../../theme/haptics';
import { overloadSuggestion, type LiftHistory, type PersonalRecord, type SessionVolumePoint } from './history';
import { VolumeTrend } from './VolumeTrend';
import { PlateCalculator } from './PlateCalculator';
import { ExerciseHelp } from './ExerciseHelp';
import { exerciseById } from './catalog';
import type { WorkoutRoutine } from './routines';
import { useAuthStore } from '../../store/authStore';
import { Action } from '../../components/FormControls';
import { Choice } from '../../components/FormControls';
import { safelyEdit } from '../../components/safelyEdit';
import { SyncIndicator } from '../../components/SyncIndicator';
import { FlashList, useRecyclingState, type FlashListRef } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { Text, TextInput } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';

import { useRestCountdown } from '../../components/providers/TrackingProvider';
import { useWorkoutStore, workoutStore } from '../../store/workoutStore';
import type { WorkoutSet } from '../../types/workout';
import { estimateBrzyckiOneRepMax } from './oneRepMax';

export type PreviousSets = Record<string, { weightLbs: number; reps: number }[]>;
const localId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const timerText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const SetRow = memo(function SetRow({ entry, index, previous, onRemove }: { entry: WorkoutSet; index: number; previous?: { weightLbs: number; reps: number }; onRemove: (id: string) => void }) {
  const dimensions = useWindowDimensions();
  const roomy = dimensions.width < 370 || dimensions.fontScale > 1.2;
  const [fields, setFields] = useRecyclingState({ weightLbs: entry.weightLbs?.toString() ?? '', reps: entry.reps?.toString() ?? '', rpe: entry.rpe?.toString() ?? '' }, [entry.id]);
  useEffect(() => {
    setFields({ weightLbs: entry.weightLbs?.toString() ?? '', reps: entry.reps?.toString() ?? '', rpe: entry.rpe?.toString() ?? '' });
  }, [entry.weightLbs, entry.reps, entry.rpe]);
  const weight = fields.weightLbs.trim() ? Number(fields.weightLbs) : null;
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
    if (valid && !completed) safelyEdit(() => workoutStore.getState().updateSet(entry.id, { weightLbs: weight, reps, rpe, estimatedOneRepMaxLbs: estimate }));
  }, [entry.id, weight, reps, rpe, estimate, valid, completed]);

  return <View className={completed ? 'mb-2 rounded-xl bg-raised px-2 py-3' : 'mb-2 rounded-xl bg-background px-2 py-3'}>
    <View className={roomy ? "flex-row flex-wrap items-center gap-2" : "flex-row items-center justify-between gap-1"}>
      <Text className="w-5 text-center font-bold text-ink">{index + 1}</Text>
      <Text className="w-10 text-center text-xs text-ink">{previous ? `${previous.weightLbs} × ${previous.reps}` : '—'}</Text>
      {(['weightLbs', 'reps', 'rpe'] as const).map((key) => <View key={key} style={roomy ? { minWidth: 88, flexBasis: '28%', flexGrow: 1 } : { flex: 1 }}>
        {roomy && <Text className="mb-1 text-sm">{key === 'weightLbs' ? 'Weight · lbs' : key === 'reps' ? 'Reps' : 'RPE'}</Text>}
        <TextInput accessibilityLabel={`${key === 'weightLbs' ? 'Weight lbs' : key === 'reps' ? 'Reps' : 'RPE'} set ${index + 1}`}
        value={fields[key]} editable={!completed} onChangeText={(text) => update(key, text)}
        keyboardType={key === 'reps' ? 'number-pad' : 'decimal-pad'} placeholder="—" selectTextOnFocus
        className="min-h-12 min-w-11 rounded-lg border border-border bg-surface px-1 py-2 text-center font-semibold text-ink"
      /></View>)}
      <Pressable accessibilityRole="button" accessibilityLabel={`Complete set ${index + 1}`} accessibilityState={{ disabled: completed || !valid || weight === null || reps === null, selected: completed }}
        disabled={completed || !valid || weight === null || reps === null} onPress={() => safelyEdit(() => {
          workoutStore.getState().updateSet(entry.id, { weightLbs: weight, reps, rpe, estimatedOneRepMaxLbs: estimate });
          workoutStore.getState().completeSet(entry.id);
        })} className={completed ? 'h-12 w-11 items-center justify-center rounded-lg bg-raised' : valid && weight !== null && reps !== null ? 'h-12 w-11 items-center justify-center rounded-lg bg-accent' : 'h-12 w-11 items-center justify-center rounded-lg bg-raised'}>
        <Text className={completed || (valid && weight !== null && reps !== null) ? 'font-bold text-ink' : 'font-bold text-ink'}>✓</Text>
      </Pressable>
    </View>
    <Text accessibilityLiveRegion="polite" className={valid ? 'mt-2 pl-1 text-xs text-ink' : 'mt-2 pl-1 text-xs text-ink'}>
      {!valid ? 'Use lbs ≥ 0, whole reps 1–1000, and RPE 1–10.' : estimate !== null ? `Estimated 1RM · ${estimate.toFixed(1)} lbs` : 'Estimated 1RM · enter a loaded set of 1–12 reps'}
    </Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Remove set ${index + 1}`} onPress={() => onRemove(entry.id)} className="min-h-12 justify-center self-end px-3"><Text className="text-sm">Remove set</Text></Pressable>
  </View>;
});

export default function ActiveWorkoutScreen({ previousSets = {} }: { previousSets?: PreviousSets }) {
  const list = useRef<FlashListRef<WorkoutSet>>(null);
  const remove = useCallback((id: string) => safelyEdit(() => workoutStore.getState().removeSet(id)), []);
  const [program, setProgram] = useState(0);
  const owner = useAuthStore(s => s.session?.user.id);
  const [builder,setBuilder] = useState(false); const [routines,setRoutines] = useState<WorkoutRoutine[]>([]);
  const [lifts,setLifts] = useState<LiftHistory>({}); const [volumeLog,setVolumeLog] = useState<SessionVolumePoint[]>([]); const [records,setRecords] = useState<PersonalRecord[]>([]);
  const [routineError,setRoutineError] = useState<string|null>(null);
  useEffect(() => {
    let active = true; setRoutines([]); setProgram(0); setBuilder(false);
    void (async () => {
      if (!owner) return;
      const {syncEngine} = await import('../sync/runtime');
      if (!active || syncEngine.owner !== owner) return;
      setRoutines(syncEngine.data.routines ?? []);
      setLifts(syncEngine.data.lifts ?? {}); setVolumeLog(syncEngine.data.volumeLog ?? []); setRecords(syncEngine.data.lastRecords ?? []);
      try {
        const remote = await (await import('../../api/routines')).loadRoutines(owner);
        if (!active || syncEngine.owner !== owner) return;
        const merged = [...new Map([...remote,...(syncEngine.data.routines ?? [])].map(r=>[r.id,r])).values()];
        syncEngine.commit({...syncEngine.data,routines:merged}); setRoutines(merged);
      } catch { if(active) setRoutineError('Showing routines saved on this device. Cloud routines will load when connected.'); }
    })(); return () => { active = false; };
  }, [owner]);
  const plans = routines.map(r=>({name:r.name,focus:`${routineExercises(r).length} exercises · ${r.timesPerWeek ?? 1}× a week`,routine:r,lifts:r.exerciseIds.map(exerciseById).filter(e=>!!e)}));
  const plan = plans[program] ?? plans[0];
  const saveRoutine = async (routine: WorkoutRoutine) => {
    const { syncEngine } = await import('../sync/runtime');
    if (!owner || syncEngine.owner !== owner) throw new Error('Sign in before saving a routine.');
    const next = [...(syncEngine.data.routines ?? []),routine];
    syncEngine.queue({kind:'routine',data:routine},`routine:${routine.id}`,{routines:next}); setRoutines(next); setRoutineError(null);
    void syncEngine.drain();
  };
  const session = useWorkoutStore((state) => state.activeSession);
  const sequence = useWorkoutStore((state) => state.exerciseSequence);
  const activeId = useWorkoutStore((state) => state.activeExerciseId);
  const sets = useWorkoutStore((state) => state.sets);
  const syncStatus = useWorkoutStore(state => state.syncStatus);
  const syncError = useWorkoutStore(state => state.syncError);
  const pending = useWorkoutStore(state => state.pendingWorkouts.length);
  const [localHistory, setLocalHistory] = useState<PreviousSets>({});
  const [finished, setFinished] = useState<string | null>(null);
  const active = sequence.find((exercise) => exercise.id === activeId);
  const currentSets = useMemo(() => sets.filter((entry) => entry.sessionExerciseId === activeId), [sets, activeId]);
  const history = active ? (localHistory[active.exercise.id] ?? previousSets[active.exercise.id] ?? lifts[active.exercise.id]?.lastSets ?? []) : [];
  const suggestion = active ? overloadSuggestion(lifts[active.exercise.id]) : null;
  const recordNames = records.map(record => ({ ...record, name: exerciseById(record.exerciseId)?.name ?? 'Lift' }));
  const volume = sets.reduce((total, entry) => total + (entry.completedAtMs !== null && !entry.isWarmup ? (entry.weightLbs ?? 0) * (entry.reps ?? 0) : 0), 0);
  const start = () => {
    if (!plan) return;
    const actions = workoutStore.getState();
    const detail = routineExercises(plan.routine);
    actions.startSession({ id: localId(), name: plan.name });
    for (const entry of detail) {
      const exercise = exerciseById(entry.exerciseId);
      if (!exercise) continue;
      const id = localId();
      actions.addExercise({ id, exercise, defaultRestSeconds: entry.restSeconds });
      for (let set = 0; set < entry.sets; set++) actions.addSet({ id: localId(), sessionExerciseId: id });
    }
    setFinished(null); haptic('success');
  };

  return <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background">
    <FlashList ref={list} key={activeId ?? 'empty'} data={currentSets} keyExtractor={entry => entry.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
      renderItem={({ item, index }) => <SetRow entry={item} index={index} previous={history[index]} onRemove={remove} />}
      ListHeaderComponent={<>
      <View className="mb-6 flex-row justify-between"><Text className="text-sm font-black tracking-widest text-ink">CALCAMP</Text><Text className="text-xs font-semibold text-ink">TRAINING</Text></View>
      <SyncIndicator />
      {!!recordNames.length && <View className="my-3 rounded-2xl bg-surface p-4">
        <Text className="font-bold">🏆 New personal record{recordNames.length > 1 ? 's' : ''}</Text>
        {recordNames.map(record => <Text key={`${record.exerciseId}:${record.kind}`} className="mt-2 text-sm text-ink">{record.name} · {record.kind === 'weight' ? 'heaviest set' : 'estimated 1RM'} {Math.round(record.value)} lbs{record.previous ? ` (was ${Math.round(record.previous)})` : ''}</Text>)}
      </View>}
      <ImportedWorkouts />
      <Text className="text-4xl font-bold tracking-tight text-ink">{session?.name ?? 'Make progress.'}</Text>
      <Text className="mt-2 text-base text-ink">{session ? 'One focused set at a time.' : 'Show up. Log your lifts. Build on last time.'}</Text>
      {pending > 0 && <Pressable accessibilityRole="button" disabled={syncStatus === 'saving'} onPress={() => void workoutStore.getState().savePendingWorkouts()} className="mt-4 rounded-xl bg-surface p-4"><Text className="font-semibold">{syncStatus === 'saving' ? 'Saving workouts…' : `Save ${pending} pending workout(s)`}</Text></Pressable>}
      {syncError && <Text accessibilityRole="alert" className="mt-3 text-sm text-ink">{syncError}</Text>}
      {syncStatus === 'saved' && <Text className="mt-3 text-sm text-ink">Workouts saved to Supabase.</Text>}
      {!session ? <View className="mt-8 rounded-3xl bg-background p-6">
        {!plans.length ? <>
          <Text className="text-2xl font-bold text-ink">Build your first routine</Text>
          <Text className="mt-3 leading-6 text-ink">CalCamp does not ship a template, because the split that works is the one you will actually run. Pick your exercises, set your own sets and rest, and we will check the weekly volume as you go.</Text>
          <Action label="Create a routine" onPress={() => setBuilder(true)} />
        </> : <>
        <Text className="text-xs font-bold uppercase tracking-widest text-ink">Ready when you are</Text>
        <Text className="mt-4 text-2xl font-bold text-ink">{plan.name}</Text>
        <Text className="mt-3 leading-6 text-ink">{plan.focus}. Sets, rest and rep ranges come from the routine — change them any time.</Text>
        <View className="mt-4 flex-row flex-wrap">{plans.map((plan, index) => <Choice key={plan.name} label={plan.name} selected={program === index} onPress={() => setProgram(index)} />)}</View>
        <Pressable accessibilityRole="button" onPress={() => safelyEdit(start)} className="mt-6 items-center rounded-2xl bg-accent p-4"><Text className="font-bold text-ink">Start session</Text></Pressable>
        <Action secondary label="Create another routine" onPress={() => setBuilder(true)} />
        </>}
        <VolumeTrend log={volumeLog} />
        {routineError && <Text>{routineError}</Text>}
        <View className="gap-2">{(plan?.lifts ?? []).map(e => <View key={e.id} className="flex-row items-center gap-3"><Text className="flex-1">{e.name}</Text><ExerciseHelp exercise={e} /></View>)}</View>
        {finished && <Text accessibilityRole="alert" className="mt-4 text-sm text-ink">{finished}</Text>}
      </View> : <>
        <SessionTimer startedAtMs={session.startedAtMs} volumeLbs={volume} sets={sets.filter(entry => entry.completedAtMs !== null).length} />
        <View className="my-6 flex-row gap-3"><View className="flex-1 rounded-2xl bg-surface p-4"><Text className="text-xs text-ink">Completed sets</Text><Text className="mt-2 text-2xl font-bold text-ink">{sets.filter((entry) => entry.completedAtMs !== null).length}</Text></View><View className="flex-1 rounded-2xl bg-surface p-4"><Text className="text-xs text-ink">Volume · lbs × reps</Text><Text className="mt-2 text-2xl font-bold text-ink">{Number(volume.toFixed(1))}</Text></View></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5" contentContainerStyle={{ gap: 8 }}>
          {sequence.map((entry, index) => <View key={entry.id} className="flex-row items-center gap-2"><Pressable accessibilityRole="tab" accessibilityLabel={entry.exercise.name} accessibilityState={{ selected: entry.id === activeId }} onPress={() => safelyEdit(() => workoutStore.getState().setActiveExercise(entry.id))} className={entry.id === activeId ? 'rounded-xl bg-background px-4 py-3' : 'rounded-xl bg-surface px-4 py-3'}><Text className={entry.id === activeId ? 'text-sm font-semibold text-ink' : 'text-sm font-semibold text-ink'}>{index + 1}. {entry.exercise.name}</Text></Pressable><ExerciseHelp exercise={entry.exercise} /></View>)}
        </ScrollView>
        {active ? <View className="rounded-3xl bg-surface pt-4">
          <View className="mx-4 flex-row items-center gap-3"><Text className="flex-1 text-xl font-bold">{active.exercise.name}</Text><ExerciseHelp exercise={active.exercise} /></View>
          <PlateCalculator suggested={suggestion?.weightLbs} />
          {suggestion && <View className="mx-4 mt-3 rounded-2xl bg-surface p-4"><Text className="font-bold">Suggested next set</Text><Text className="mt-1 text-lg font-bold">{suggestion.weightLbs} lbs × {suggestion.reps}</Text><Text className="mt-1 text-sm text-ink">{suggestion.reason}</Text></View>}
          {!!lifts[active.exercise.id] && <Text className="mx-4 mt-2 text-sm text-ink">Best so far: {Math.round(lifts[active.exercise.id].bestWeightLbs)} lbs · est. 1RM {Math.round(lifts[active.exercise.id].bestOneRepMaxLbs)} lbs · {lifts[active.exercise.id].sessions} session(s) logged.</Text>}
          <Text className="mx-4 mb-5 mt-2 text-sm text-ink">{active.exercise.grip ?? 'Custom grip'} · {active.exercise.equipment ?? 'Custom exercise'} · {active.defaultRestSeconds}s rest</Text>
          <View className="mb-3 flex-row gap-1 px-2">{['Set','Previous','lbs','Reps','RPE','Done'].map((label, index) => <Text key={label} className="text-center text-xs text-ink" style={index === 0 ? { width: 20 } : index === 1 ? { width: 40 } : index === 5 ? { width: 44 } : { flex: 1 }}>{label}</Text>)}</View>
        </View> : <Text className="text-ink">Choose an exercise to begin logging.</Text>}
      </>}
      </>}
      ListFooterComponent={session ? <>
        {active && <Pressable accessibilityRole="button" onPress={() => safelyEdit(() => workoutStore.getState().addSet({ id: localId(), sessionExerciseId: active.id }))} className="mt-3 items-center rounded-xl bg-raised p-4"><Text className="font-bold text-ink">+ Add set</Text></Pressable>
        }
        <RestTimerPanel />
        <Pressable accessibilityRole="button" onPress={() => safelyEdit(() => {
          const snapshot = workoutStore.getState().finishSession();
          const next: PreviousSets = {};
          for (const exercise of snapshot.exercises) {
            const completed = snapshot.sets.filter((entry) => entry.sessionExerciseId === exercise.id && entry.completedAtMs !== null && !entry.isWarmup);
            if (completed.length) next[exercise.exercise.id] = completed.map((entry) => ({ weightLbs: entry.weightLbs!, reps: entry.reps! }));
          }
          setLocalHistory((current) => ({ ...current, ...next }));
          setFinished('Session finished and queued for cloud save.');
          void workoutStore.getState().savePendingWorkouts();
        })} className="mt-6 items-center rounded-2xl border border-border p-4"><Text className="font-bold text-ink">Finish session</Text></Pressable>
      </> : null}
    />
    {builder && <RoutineBuilder onClose={() => setBuilder(false)} onSave={saveRoutine} />}
  </SafeAreaView>;
}

function RestTimerPanel() {
  const timer = useWorkoutStore(s => s.restTimer); const remaining = useRestCountdown();
  return <View className="mt-5 rounded-3xl bg-background p-5">
          <View className="flex-row items-center justify-between"><View><Text className="text-xs font-bold uppercase tracking-widest text-ink">{timer ? 'Rest remaining' : 'Between sets'}</Text><Text testID="rest-countdown" accessibilityLiveRegion="none" className="mt-2 text-4xl font-bold tabular-nums text-ink">{timer ? timerText(remaining) : 'Ready'}</Text></View>{timer && <Pressable accessibilityRole="button" onPress={() => safelyEdit(() => workoutStore.getState().clearRestTimer())} className="rounded-xl bg-raised px-4 py-3"><Text className="font-semibold text-ink">Skip rest</Text></Pressable>}</View>
          <Text className="mt-3 text-sm text-ink">{timer ? 'Take a breath. Your next set is coming.' : 'Complete a set to start your rest timer.'}</Text>
        </View>;
}

function ImportedWorkouts() {
  const imports = useWorkoutStore(s => s.importedWorkouts);
  return !!imports.length && <View className="my-3 rounded-xl bg-surface p-4"><Text className="font-semibold">Apple Health · recent workouts</Text>{imports.slice(0, 5).map(w => <Text key={w.id} className="mt-2 text-sm text-ink">{w.name} · {new Date(w.start).toLocaleDateString()}</Text>)}<Text className="mt-2 text-xs text-ink">Imported sessions are shown separately from manually logged sets and volume.</Text></View>;
}
