import { RoutineBuilder } from './RoutineBuilder';
import { router } from 'expo-router';
import { SessionTimer } from './SessionTimer';
import { TrainingTips } from './TrainingTips';
import { readExperience } from './experience';
import { routineExercises } from './routines';
import { haptic } from '../../theme/haptics';
import { overloadSuggestion, type LiftHistory, type PersonalRecord, type SessionVolumePoint } from './history';
import { VolumeTrend } from './VolumeTrend';
import { PlateCalculator } from './PlateCalculator';
import { ExerciseHelp } from './ExerciseHelp';
import { ExerciseOrder } from './ExerciseOrder';
import { ExercisePickerSheet } from './ExercisePickerSheet';
import { ExerciseNote } from './ExerciseNote';
import { DEFAULT_REST_SECONDS } from './routines';
import { SessionControls } from './SessionControls';
import { exerciseById } from './catalog';
import type { WorkoutRoutine } from './routines';
import { useAuthStore } from '../../store/authStore';
import { Action } from '../../components/FormControls';
import { useT } from '../../i18n';
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
/** Whether a slot already holds work that a swap would throw away. */
const loggedFor = (sets: WorkoutSet[], sessionExerciseId: string) =>
  sets.some(entry => entry.sessionExerciseId === sessionExerciseId
    && (entry.completedAtMs !== null || entry.weightLbs !== null || entry.reps !== null));
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
      {/* A warm-up set is numbered W rather than 3, the way it reads on paper. */}
      <Text className="w-5 text-center font-bold text-ink">{entry.isWarmup ? 'W' : index + 1}</Text>
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
    <View className="flex-row items-center justify-end gap-1">
      {/* Warm-ups are logged but never counted: they must not inflate weekly hard sets. */}
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: entry.isWarmup }}
        accessibilityLabel={`Warm-up set ${index + 1}`} weight="subtle"
        onPress={() => safelyEdit(() => workoutStore.getState().updateSet(entry.id, { isWarmup: !entry.isWarmup }))}
        className={`min-h-12 justify-center rounded-lg px-3 ${entry.isWarmup ? 'bg-accent' : 'bg-raised'}`}>
        <Text className="text-sm font-semibold">{entry.isWarmup ? '✓ Warm-up' : 'Warm-up'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove set ${index + 1}`} onPress={() => onRemove(entry.id)} className="min-h-12 justify-center px-3"><Text className="text-sm">Remove set</Text></Pressable>
    </View>
  </View>;
});

export default function ActiveWorkoutScreen({ previousSets = {} }: { previousSets?: PreviousSets }) {
  const t = useT();
  const list = useRef<FlashListRef<WorkoutSet>>(null);
  const remove = useCallback((id: string) => safelyEdit(() => workoutStore.getState().removeSet(id)), []);
  const [program, setProgram] = useState(0);
  const owner = useAuthStore(s => s.session?.user.id);
  const [builder,setBuilder] = useState<WorkoutRoutine|'new'|null>(null); const [routines,setRoutines] = useState<WorkoutRoutine[]>([]);
  const experience = useMemo(() => readExperience(owner ?? 'anonymous'), [owner]);
  const [lifts,setLifts] = useState<LiftHistory>({}); const [volumeLog,setVolumeLog] = useState<SessionVolumePoint[]>([]); const [records,setRecords] = useState<PersonalRecord[]>([]);
  const [routineError,setRoutineError] = useState<string|null>(null);
  useEffect(() => {
    let active = true; setRoutines([]); setProgram(0); setBuilder(null);
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
    // An edit keeps the routine's id, so it replaces in place. Appending would leave the old
    // version behind and the picker would show the same routine twice.
    const saved = syncEngine.data.routines ?? [];
    const next = saved.some(entry => entry.id === routine.id)
      ? saved.map(entry => entry.id === routine.id ? routine : entry) : [...saved,routine];
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
  const [ordering, setOrdering] = useState(false);
  // Either adding a lift that was never in the routine, or swapping the one in a given slot.
  const [picking, setPicking] = useState<{ mode: 'add' } | { mode: 'replace'; sessionExerciseId: string } | null>(null);
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
        <Text className="font-bold">{t('train.newRecord')}</Text>
        {recordNames.map(record => <Text key={`${record.exerciseId}:${record.kind}`} className="mt-2 text-sm text-ink">{record.name} · {record.kind === 'weight' ? 'heaviest set' : 'estimated 1RM'} {Math.round(record.value)} lbs{record.previous ? ` (was ${Math.round(record.previous)})` : ''}</Text>)}
      </View>}
      <ImportedWorkouts />
      <Text className="text-4xl font-bold tracking-tight text-ink">{session?.name ?? t('train.title')}</Text>
      <Text className="mt-2 text-base text-ink">{session ? t('train.subtitleActive') : t('train.subtitleIdle')}</Text>
      {pending > 0 && <Pressable accessibilityRole="button" disabled={syncStatus === 'saving'} onPress={() => void workoutStore.getState().savePendingWorkouts()} className="mt-4 rounded-xl bg-surface p-4"><Text className="font-semibold">{syncStatus === 'saving' ? 'Saving workouts…' : `Save ${pending} pending workout(s)`}</Text></Pressable>}
      {syncError && <Text accessibilityRole="alert" className="mt-3 text-sm text-ink">{syncError}</Text>}
      {syncStatus === 'saved' && <Text className="mt-3 text-sm text-ink">Workouts saved to Supabase.</Text>}
      {!session ? <View className="mt-8 rounded-3xl bg-background p-6">
        {!plans.length ? <>
          <Text className="text-2xl font-bold text-ink">Build your first routine</Text>
          <Text className="mt-3 leading-6 text-ink">CalCamp does not ship a template, because the split that works is the one you will actually run. Pick your exercises, set your own sets and rest, and we will check the weekly volume as you go.</Text>
          <Action label={t('train.createRoutine')} onPress={() => setBuilder('new')} />
        </> : <>
        <Text className="text-xs font-bold uppercase tracking-widest text-ink">Ready when you are</Text>
        <Text className="mt-4 text-2xl font-bold text-ink">{plan.name}</Text>
        <Text className="mt-3 leading-6 text-ink">{plan.focus}. Sets, rest and rep ranges come from the routine — change them any time.</Text>
        <View className="mt-4 flex-row flex-wrap">{plans.map((plan, index) => <Choice key={plan.name} label={plan.name} selected={program === index} onPress={() => setProgram(index)} />)}</View>
        <Pressable accessibilityRole="button" onPress={() => safelyEdit(start)} className="mt-6 items-center rounded-2xl bg-accent p-4"><Text className="font-bold text-ink">{t('train.startSession')}</Text></Pressable>
        <Action secondary label={`Edit ${plan.name}`} onPress={() => setBuilder(plan.routine)} />
        <Action secondary label={t('train.createAnother')} onPress={() => setBuilder('new')} />
        </>}
        <TrainingTips routines={routines} experience={experience} lifts={lifts} volumeLog={volumeLog} />
        <Action secondary label={t('train.history')} onPress={() => router.push('/workouts')} />
        <VolumeTrend log={volumeLog} />
        {routineError && <Text>{routineError}</Text>}
        <View className="gap-2">{(plan?.lifts ?? []).map(e => <View key={e.id} className="flex-row items-center gap-3"><Text className="flex-1">{e.name}</Text><ExerciseHelp exercise={e} /></View>)}</View>
        {finished && <Text accessibilityRole="alert" className="mt-4 text-sm text-ink">{finished}</Text>}
      </View> : <>
        <SessionTimer startedAtMs={session.startedAtMs} volumeLbs={volume} sets={sets.filter(entry => entry.completedAtMs !== null).length} />
        <View className="my-6 flex-row flex-wrap gap-3">
          <View className="items-center rounded-2xl bg-surface p-4" style={{ flexGrow: 1, flexBasis: 140 }}>
            <Text className="text-3xl font-bold" style={{ fontVariant: ['tabular-nums'] }}>{sets.filter(entry => entry.completedAtMs !== null).length}</Text>
            <Text className="mt-1 text-xs">{t('train.completedSets')}</Text></View>
          <View className="items-center rounded-2xl bg-surface p-4" style={{ flexGrow: 1, flexBasis: 140 }}>
            <Text className="text-3xl font-bold" style={{ fontVariant: ['tabular-nums'] }}>{Math.round(volume).toLocaleString()}</Text>
            <Text className="mt-1 text-xs">{t('train.volume')}</Text></View>
        </View>
        <View className="mb-2 flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-sm font-bold tracking-widest">{t('train.exercises')}</Text>
          {/* Whatever the routine said, the session is what you actually did: anything in the
              catalogue can join it, and nothing has to be planned in advance to be logged. */}
          <Pressable accessibilityRole="button" accessibilityLabel="Add an exercise to this session"
            onPress={() => setPicking({ mode: 'add' })} weight="subtle"
            className="min-h-11 justify-center rounded-full bg-surface px-4"><Text className="text-sm font-semibold">＋ Add</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('train.reorder')} onPress={() => setOrdering(true)} weight="subtle"
            className="min-h-11 justify-center rounded-full bg-surface px-4"><Text className="text-sm font-semibold">{t('train.reorder')}</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5" contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
          {sequence.map((entry, index) => <Pressable key={entry.id} accessibilityRole="tab" accessibilityLabel={entry.exercise.name}
            accessibilityState={{ selected: entry.id === activeId }}
            onPress={() => safelyEdit(() => workoutStore.getState().setActiveExercise(entry.id))} weight="subtle"
            className={`min-h-12 justify-center rounded-xl px-4 ${entry.id === activeId ? 'bg-accent' : 'bg-surface'}`}>
            <Text className="text-sm font-semibold">{index + 1}. {entry.exercise.name}</Text>
          </Pressable>)}
        </ScrollView>
        {active ? <View className="rounded-3xl bg-surface pt-4">
          <View className="mx-4 flex-row items-center gap-3">
            <Text className="flex-1 text-xl font-bold">{active.exercise.name}</Text>
            {/* The rack is taken, the machine is broken: swap the slot without losing the order
                you planned or the exercises either side of it. */}
            <Pressable accessibilityRole="button" accessibilityLabel={`Replace ${active.exercise.name}`}
              onPress={() => setPicking({ mode: 'replace', sessionExerciseId: active.id })} weight="subtle"
              className="min-h-11 justify-center rounded-full bg-raised px-4"><Text className="text-sm font-semibold">Replace</Text></Pressable>
            <ExerciseHelp exercise={active.exercise} />
          </View>
          <ExerciseNote entry={active} />
          <PlateCalculator suggested={suggestion?.weightLbs} />
          {suggestion && <View className="mx-4 mt-3 rounded-2xl bg-surface p-4"><Text className="font-bold">Suggested next set</Text><Text className="mt-1 text-lg font-bold">{suggestion.weightLbs} lbs × {suggestion.reps}</Text><Text className="mt-1 text-sm text-ink">{suggestion.reason}</Text></View>}
          {!!lifts[active.exercise.id] && <Text className="mx-4 mt-2 text-sm text-ink">Best so far: {Math.round(lifts[active.exercise.id].bestWeightLbs)} lbs · est. 1RM {Math.round(lifts[active.exercise.id].bestOneRepMaxLbs)} lbs · {lifts[active.exercise.id].sessions} session(s) logged.</Text>}
          <Text className="mx-4 mb-5 mt-2 text-sm text-ink">{active.exercise.grip ?? 'Custom grip'} · {active.exercise.equipment ?? 'Custom exercise'} · {active.defaultRestSeconds}s rest</Text>
          <View className="mb-3 flex-row gap-1 px-2">{['Set','Previous','lbs','Reps','RPE','Done'].map((label, index) => <Text key={label} className="text-center text-xs text-ink" style={index === 0 ? { width: 20 } : index === 1 ? { width: 40 } : index === 5 ? { width: 44 } : { flex: 1 }}>{label}</Text>)}</View>
        </View> : <Text className="text-ink">Choose an exercise to begin logging.</Text>}
      </>}
      </>}
      ListFooterComponent={session ? <>
        {active && <Pressable accessibilityRole="button" onPress={() => safelyEdit(() => workoutStore.getState().addSet({ id: localId(), sessionExerciseId: active.id }))} className="mt-3 items-center rounded-xl bg-raised p-4"><Text className="font-bold text-ink">{t('train.addSet')}</Text></Pressable>
        }
        <RestTimerPanel />
        <SessionControls completedSets={sets.filter(entry => entry.completedAtMs !== null).length} volumeLbs={volume}
          onFinish={() => safelyEdit(() => {
            const snapshot = workoutStore.getState().finishSession();
            const next: PreviousSets = {};
            for (const exercise of snapshot.exercises) {
              const completed = snapshot.sets.filter((entry) => entry.sessionExerciseId === exercise.id && entry.completedAtMs !== null && !entry.isWarmup);
              if (completed.length) next[exercise.exercise.id] = completed.map((entry) => ({ weightLbs: entry.weightLbs!, reps: entry.reps! }));
            }
            setLocalHistory((current) => ({ ...current, ...next }));
            setFinished('Session finished and queued for cloud save.');
            void workoutStore.getState().savePendingWorkouts();
          })}
          onCancel={() => safelyEdit(() => { workoutStore.getState().cancelSession(); setFinished('Session discarded. Nothing was recorded.'); })} />
      </> : null}
    />
    {builder && <RoutineBuilder existing={builder === 'new' ? undefined : builder}
      onClose={() => setBuilder(null)} onSave={saveRoutine} />}
    {ordering && <ExerciseOrder sequence={sequence} onClose={() => setOrdering(false)} />}
    {picking?.mode === 'add' && <ExercisePickerSheet
      title="Add an exercise" subtitle="Anything in the catalogue can join this session, routine or not."
      confirmLabel={exercise => `Add ${exercise.name}`} onClose={() => setPicking(null)}
      onChoose={exercise => safelyEdit(() => {
        const id = localId();
        const actions = workoutStore.getState();
        actions.addExercise({ id, exercise, defaultRestSeconds: DEFAULT_REST_SECONDS });
        actions.addSet({ id: localId(), sessionExerciseId: id });
        actions.setActiveExercise(id);
        haptic('success');
      })} />}
    {picking?.mode === 'replace' && <ExercisePickerSheet
      title="Replace this exercise"
      subtitle={`${sequence.find(entry => entry.id === picking.sessionExerciseId)?.exercise.name ?? 'This exercise'} keeps its place in the order.`}
      warning={loggedFor(sets, picking.sessionExerciseId)
        ? 'Sets you have already logged here will be cleared — they were done on a different lift. To keep them, cancel and add the new exercise instead.'
        : undefined}
      confirmLabel={exercise => `Swap in ${exercise.name}`} onClose={() => setPicking(null)}
      onChoose={exercise => safelyEdit(() => {
        workoutStore.getState().replaceExercise(picking.sessionExerciseId, exercise);
        haptic('success');
      })} />}
  </SafeAreaView>;
}

function RestTimerPanel() {
  const timer = useWorkoutStore(s => s.restTimer); const remaining = useRestCountdown();
  return <View className="mt-5 items-center rounded-3xl border border-border bg-surface p-5">
    <Text className="text-xs font-bold uppercase tracking-widest">{timer ? 'Rest remaining' : 'Between sets'}</Text>
    <Text testID="rest-countdown" accessibilityLiveRegion="none" className="my-2 text-5xl font-bold"
      style={{ fontVariant: ['tabular-nums'] }}>{timer ? timerText(remaining) : 'Ready'}</Text>
    <Text className="text-center text-sm">{timer ? 'Take a breath. Your next set is coming.' : 'Complete a set to start your rest timer.'}</Text>
    {timer && <Pressable accessibilityRole="button" accessibilityLabel="Skip rest"
      onPress={() => safelyEdit(() => workoutStore.getState().clearRestTimer())} weight="subtle"
      className="mt-4 min-h-12 justify-center rounded-xl bg-raised px-5"><Text className="font-semibold">Skip rest</Text></Pressable>}
  </View>;
}

function ImportedWorkouts() {
  const imports = useWorkoutStore(s => s.importedWorkouts);
  return !!imports.length && <View className="my-3 rounded-xl bg-surface p-4"><Text className="font-semibold">Apple Health · recent workouts</Text>{imports.slice(0, 5).map(w => <Text key={w.id} className="mt-2 text-sm text-ink">{w.name} · {new Date(w.start).toLocaleDateString()}</Text>)}<Text className="mt-2 text-xs text-ink">Imported sessions are shown separately from manually logged sets and volume.</Text></View>;
}
