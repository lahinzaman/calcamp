import { RoutineBuilder } from './RoutineBuilder';
import { router } from 'expo-router';
import { SessionTimer } from './SessionTimer';
import { TrainingTips } from './TrainingTips';
import { readExperience } from './experience';
import { routineExercises } from './routines';
import { haptic } from '../../theme/haptics';
import { overloadSuggestion, type LiftHistory, type PersonalRecord, type RecordedSet, type SessionVolumePoint } from './history';
import { describePrevious, isHardSet, missingFor, outOfRange, SET_KIND_LABELS, SET_KIND_MARKS, SET_KINDS, SET_SHAPES, setVolumeLbs, supportsOneRepMax, trackingTypeOf } from './setShape';
import { VolumeTrend } from './VolumeTrend';
import { PlateCalculator } from './PlateCalculator';
import { ExerciseHelp } from './ExerciseHelp';
import { ExerciseOrder } from './ExerciseOrder';
import { ExercisePickerSheet } from './ExercisePickerSheet';
import { SupersetSheet } from './SupersetSheet';
import { groupOf, groups, supersetLabel } from './supersets';
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
import type { TrackingType, WorkoutSet } from '../../types/workout';
import { estimateBrzyckiOneRepMax } from './oneRepMax';

export type PreviousSets = Record<string, RecordedSet[]>;
const number = (value: string | undefined) => value?.trim() ? Number(value) : null;
const text = (value: number | null | undefined) => value === null || value === undefined ? '' : String(value);
const localId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
/** Whether a slot already holds work that a swap would throw away. */
const loggedFor = (sets: WorkoutSet[], sessionExerciseId: string) =>
  sets.some(entry => entry.sessionExerciseId === sessionExerciseId
    && (entry.completedAtMs !== null || entry.weightLbs !== null || entry.reps !== null));
const timerText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const SetRow = memo(function SetRow({ entry, index, previous, trackingType, onRemove }: { entry: WorkoutSet; index: number; previous?: RecordedSet; trackingType: TrackingType; onRemove: (id: string) => void }) {
  const dimensions = useWindowDimensions();
  const shape = SET_SHAPES[trackingType];
  // Which boxes this exercise actually has. A plank shows seconds; a carry shows metres.
  // `name` is the accessibility label and stays stable; `label` is what the column header reads.
  const columns = useMemo(() => ([
    { key: 'weightLbs', need: shape.weight, name: 'Weight lbs', label: 'Weight · lbs', keyboard: 'decimal-pad' as const },
    { key: 'reps', need: shape.reps, name: 'Reps', label: 'Reps', keyboard: 'number-pad' as const },
    { key: 'durationSeconds', need: shape.duration, name: 'Seconds', label: 'Seconds', keyboard: 'number-pad' as const },
    { key: 'distanceMeters', need: shape.distance, name: 'Metres', label: 'Metres', keyboard: 'decimal-pad' as const },
    { key: 'rpe', need: 'optional' as const, name: 'RPE', label: 'RPE', keyboard: 'decimal-pad' as const },
  ] as const).filter(column => column.need !== 'none'), [shape]);
  const roomy = dimensions.width < 370 || dimensions.fontScale > 1.2 || columns.length > 3;
  const blank = () => Object.fromEntries(columns.map(column => [column.key, text(entry[column.key])])) as Record<string, string>;
  const [fields, setFields] = useRecyclingState(blank, [entry.id]);
  const [kindOpen, setKindOpen] = useState(false);
  useEffect(() => { setFields(blank()); },
    [entry.weightLbs, entry.reps, entry.rpe, entry.durationSeconds, entry.distanceMeters]);

  const values = useMemo(() => ({
    weightLbs: number(fields.weightLbs), reps: number(fields.reps), rpe: number(fields.rpe),
    durationSeconds: number(fields.durationSeconds), distanceMeters: number(fields.distanceMeters),
  }), [fields]);
  const rangeProblem = outOfRange(values);
  const valid = !rangeProblem;
  const missing = missingFor(values, trackingType);
  const estimate = valid && supportsOneRepMax(trackingType) ? estimateBrzyckiOneRepMax(values.weightLbs, values.reps) : null;
  const completed = entry.completedAtMs !== null;
  const update = (key: string, value: string) => setFields(current => ({ ...current, [key]: value }));
  useEffect(() => {
    if (valid && !completed) safelyEdit(() => workoutStore.getState().updateSet(entry.id, { ...values, estimatedOneRepMaxLbs: estimate }));
  }, [entry.id, values, estimate, valid, completed]);

  return <View className={completed ? 'mb-2 rounded-xl bg-raised px-2 py-3' : 'mb-2 rounded-xl bg-background px-2 py-3'}>
    <View className={roomy ? 'flex-row flex-wrap items-center gap-2' : 'flex-row items-center justify-between gap-1'}>
      {/* The set number doubles as the set type: 1, or W, D, F for what it actually was. */}
      <Pressable accessibilityRole="button" accessibilityLabel={`Set ${index + 1} type, ${SET_KIND_LABELS[entry.kind]}`}
        onPress={() => setKindOpen(open => !open)} weight="subtle"
        className="h-9 w-7 items-center justify-center rounded-lg">
        <Text className="text-center font-bold text-ink">{SET_KIND_MARKS[entry.kind] || index + 1}</Text></Pressable>
      <Text className="w-12 text-center text-xs text-ink">{previous ? describePrevious(previous, trackingType) : '—'}</Text>
      {columns.map(column => <View key={column.key} style={roomy ? { minWidth: 88, flexBasis: '28%', flexGrow: 1 } : { flex: 1 }}>
        {roomy && <Text className="mb-1 text-sm">{column.label}</Text>}
        <TextInput accessibilityLabel={`${column.name} set ${index + 1}`}
          value={fields[column.key] ?? ''} editable={!completed} onChangeText={value => update(column.key, value)}
          keyboardType={column.keyboard} placeholder="—" selectTextOnFocus
          className="min-h-12 min-w-11 rounded-lg border border-border bg-surface px-1 py-2 text-center font-semibold text-ink" />
      </View>)}
      <Pressable accessibilityRole="button" accessibilityLabel={`Complete set ${index + 1}`}
        accessibilityState={{ disabled: completed || !valid || !!missing, selected: completed }}
        disabled={completed || !valid || !!missing} onPress={() => safelyEdit(() => {
          workoutStore.getState().updateSet(entry.id, { ...values, estimatedOneRepMaxLbs: estimate });
          workoutStore.getState().completeSet(entry.id);
        })} className={`h-12 w-11 items-center justify-center rounded-lg ${!completed && valid && !missing ? 'bg-accent' : 'bg-raised'}`}>
        <Text className="font-bold text-ink">✓</Text>
      </Pressable>
    </View>
    {kindOpen && <View className="mt-2 flex-row flex-wrap">
      {SET_KINDS.map(kind => <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ checked: entry.kind === kind }}
        accessibilityLabel={`${SET_KIND_LABELS[kind]} set ${index + 1}`} weight="subtle"
        onPress={() => { safelyEdit(() => workoutStore.getState().updateSet(entry.id, { kind })); setKindOpen(false); haptic('selection'); }}
        className={`mb-2 mr-2 min-h-11 justify-center rounded-full px-4 ${entry.kind === kind ? 'bg-accent' : 'bg-raised'}`}>
        <Text className="text-sm font-semibold">{SET_KIND_LABELS[kind]}</Text></Pressable>)}
      {/* Said once, where the choice is made: a warm-up is the only kind that is not volume. */}
      <Text className="mt-1 w-full text-xs">Warm-ups are logged but never counted toward your weekly hard sets. Drop sets and sets to failure are.</Text>
    </View>}
    <Text accessibilityLiveRegion="polite" className="mt-2 pl-1 text-xs text-ink">
      {rangeProblem ?? (missing && !completed ? missing
        : estimate !== null ? `Estimated 1RM · ${estimate.toFixed(1)} lbs`
        : supportsOneRepMax(trackingType) ? 'Estimated 1RM · enter a loaded set of 1–12 reps'
        : SET_SHAPES[trackingType].label)}
    </Text>
    <View className="flex-row items-center justify-end gap-1">
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
  const [pairing, setPairing] = useState(false);
  const active = sequence.find((exercise) => exercise.id === activeId);
  const currentSets = useMemo(() => sets.filter((entry) => entry.sessionExerciseId === activeId), [sets, activeId]);
  const history = active ? (localHistory[active.exercise.id] ?? previousSets[active.exercise.id] ?? lifts[active.exercise.id]?.lastSets ?? []) : [];
  const suggestion = active ? overloadSuggestion(lifts[active.exercise.id]) : null;
  const recordNames = records.map(record => ({ ...record, name: exerciseById(record.exerciseId)?.name ?? 'Lift' }));
  // Lbs moved. A plank and a carry contribute nothing here — they are work, but not this work.
  const volume = sets.reduce((total, entry) => total + setVolumeLbs(entry,
    trackingTypeOf(sequence.find(slot => slot.id === entry.sessionExerciseId)?.exercise)), 0);
  const activeTracking = trackingTypeOf(active?.exercise);
  const pairs = useMemo(() => groups(sequence), [sequence]);
  const activePair = useMemo(() => active ? groupOf(sequence, active.id) : [], [sequence, active]);
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
      renderItem={({ item, index }) => <SetRow entry={item} index={index} previous={history[index]} trackingType={activeTracking} onRemove={remove} />}
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
          <Pressable accessibilityRole="button" accessibilityLabel="Set up supersets" onPress={() => setPairing(true)} weight="subtle"
            className="min-h-11 justify-center rounded-full bg-surface px-4"><Text className="text-sm font-semibold">Superset</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('train.reorder')} onPress={() => setOrdering(true)} weight="subtle"
            className="min-h-11 justify-center rounded-full bg-surface px-4"><Text className="text-sm font-semibold">{t('train.reorder')}</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5" contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
          {sequence.map((entry, index) => {
            const group = entry.supersetId ? pairs.findIndex(item => item.id === entry.supersetId) : -1;
            return <Pressable key={entry.id} accessibilityRole="tab"
              accessibilityLabel={group >= 0 ? `${entry.exercise.name}, superset ${supersetLabel(group)}` : entry.exercise.name}
              accessibilityState={{ selected: entry.id === activeId }}
              onPress={() => safelyEdit(() => workoutStore.getState().setActiveExercise(entry.id))} weight="subtle"
              className={`min-h-12 justify-center rounded-xl px-4 ${entry.id === activeId ? 'bg-accent' : 'bg-surface'} ${group >= 0 ? 'border border-accent' : ''}`}>
              <Text className="text-sm font-semibold">{group >= 0 ? `${supersetLabel(group)}· ` : `${index + 1}. `}{entry.exercise.name}</Text>
            </Pressable>;
          })}
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
          {activePair.length > 1 && <Text className="mx-4 mt-2 text-sm">
            Superset with {activePair.filter(entry => entry.id !== active.id).map(entry => entry.exercise.name).join(' and ')} · rest starts once the round is done.
          </Text>}
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
              const completed = snapshot.sets.filter((entry) => entry.sessionExerciseId === exercise.id && entry.completedAtMs !== null && isHardSet(entry));
              if (completed.length) next[exercise.exercise.id] = completed.map((entry) => ({
                weightLbs: entry.weightLbs, reps: entry.reps, durationSeconds: entry.durationSeconds, distanceMeters: entry.distanceMeters }));
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
    {pairing && <SupersetSheet sequence={sequence} onClose={() => setPairing(false)} />}
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
