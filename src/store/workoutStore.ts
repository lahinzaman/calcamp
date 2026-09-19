import { syncBridge } from '../modules/sync/bridge';
import type { TrackingRepository } from '../api/trackingRepository';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { missingFor, outOfRange, SET_KINDS, shapeOf, trackingTypeOf } from '../modules/workout/setShape';
import { assignSuperset, clearSuperset, nextAfterSet, prune, restsAfter } from '../modules/workout/supersets';
import { MAX_EXERCISE_NOTE } from '../types/workout';
export { MAX_EXERCISE_NOTE };
import type {
  CompletedWorkout,
  ExerciseDefinition,
  RestTimer,
  SessionExercise,
  WorkoutSession,
  WorkoutSet,
} from '../types/workout';

export interface WorkoutState {
  /** Imported Health workouts are informational; never duplicated as manual sets or volume. */
  importedWorkouts: import('../modules/health/types').HealthWorkout[];
  activeSession: WorkoutSession | null;
  exerciseSequence: SessionExercise[];
  activeExerciseId: string | null;
  /** Order within each exercise determines its set order. */
  sets: WorkoutSet[];
  restTimer: RestTimer | null;
  pendingWorkouts: { workout: CompletedWorkout; ownerId: string | null }[];
  syncStatus: 'idle' | 'saving' | 'saved' | 'error';
  syncError: string | null;
}

export type SetInput = Pick<WorkoutSet, 'id' | 'sessionExerciseId'> &
  Partial<Omit<WorkoutSet, 'id' | 'sessionExerciseId' | 'completedAtMs'>>;
export type SetUpdate = Partial<Omit<WorkoutSet, 'id' | 'sessionExerciseId' | 'completedAtMs'>>;

export interface WorkoutActions {
  startSession: (session: { id: string; name: string; startedAtMs?: number }) => void;
  addExercise: (exercise: SessionExercise) => void;
  removeExercise: (sessionExerciseId: string) => void;
  /**
   * Swaps the lift in a slot, keeping its place in the order and its rest. Logged sets belong
   * to the exercise that was actually performed, so they cannot follow it to a different one:
   * every set is reset to empty. Callers warn first — see `completedSetsFor`.
   */
  replaceExercise: (sessionExerciseId: string, exercise: ExerciseDefinition, defaultRestSeconds?: number) => void;
  /** An empty or blank note removes it rather than storing whitespace. */
  setExerciseNote: (sessionExerciseId: string, note: string) => void;
  /** Pairs two or more exercises so they are done back to back, with the rest after the round. */
  groupSuperset: (sessionExerciseIds: string[], supersetId?: string) => void;
  ungroupSuperset: (supersetId: string) => void;
  reorderExercises: (sessionExerciseIds: string[]) => void;
  setActiveExercise: (sessionExerciseId: string) => void;
  addSet: (set: SetInput) => void;
  updateSet: (setId: string, update: SetUpdate) => void;
  removeSet: (setId: string) => void;
  completeSet: (setId: string, completedAtMs?: number) => void;
  startRestTimer: (durationSeconds: number, startedAtMs?: number) => void;
  clearRestTimer: () => void;
  clearExpiredRestTimer: (nowMs?: number) => void;
  /** Returns the detached session for a later persistence layer, then clears state. */
  finishSession: (endedAtMs?: number) => CompletedWorkout;
  /** Throws the session away. Nothing is queued, so nothing reaches history. */
  cancelSession: () => void;
  savePendingWorkouts: () => Promise<void>;
  reset: () => void;
}

export type WorkoutStore = WorkoutState & WorkoutActions;

function initialState(): WorkoutState {
  return {
    importedWorkouts: [],
    activeSession: null,
    exerciseSequence: [],
    activeExerciseId: null,
    sets: [],
    restTimer: null,
    pendingWorkouts: [],
    syncStatus: 'idle',
    syncError: null,
  };
}

function nonnegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${field} must be finite and nonnegative.`);
}

function requireId(id: string) {
  if (!id.trim()) throw new TypeError('An ID is required.');
}

function requireSession(state: WorkoutState): WorkoutSession {
  if (!state.activeSession) throw new Error('Start a workout session first.');
  return state.activeSession;
}

function validateTimestamp(timestamp: number, session: WorkoutSession) {
  nonnegative(timestamp, 'Timestamp');
  if (timestamp < session.startedAtMs) throw new RangeError('Timestamp precedes the session start.');
}

function validateSet(set: WorkoutSet, exercise?: SessionExercise) {
  const problem = outOfRange(set);
  if (problem) throw new RangeError(problem);
  // A measurement the exercise does not have must stay empty, or a plank could carry a rep
  // count that nothing would ever show and the weekly volume would quietly count it.
  const shape = shapeOf(exercise?.exercise);
  if (shape.weight === 'none' && set.weightLbs !== null) throw new RangeError('This exercise is not measured in weight.');
  if (shape.reps === 'none' && set.reps !== null) throw new RangeError('This exercise is not measured in reps.');
  if (shape.duration === 'none' && set.durationSeconds !== null) throw new RangeError('This exercise is not measured in time.');
  if (shape.distance === 'none' && set.distanceMeters !== null) throw new RangeError('This exercise is not measured in distance.');
  if (set.estimatedOneRepMaxLbs !== null) nonnegative(set.estimatedOneRepMaxLbs, 'Estimated 1RM');
  if (!SET_KINDS.includes(set.kind)) throw new RangeError('Choose a valid set type.');
  validateRestDuration(set.restSeconds);
}

function validateRestDuration(seconds: number) {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
    throw new RangeError('Rest duration must be an integer from 0 through 3600 seconds.');
  }
}

function makeTimer(durationSeconds: number, startedAtMs: number, sourceSetId: string | null): RestTimer | null {
  validateRestDuration(durationSeconds);
  nonnegative(startedAtMs, 'Timer start');
  const endsAtMs = startedAtMs + durationSeconds * 1000;
  nonnegative(endsAtMs, 'Timer end');
  return durationSeconds === 0 ? null : { durationSeconds, startedAtMs, endsAtMs, sourceSetId };
}

/** Derive from wall-clock timestamps so backgrounding never drifts the countdown. */
export function getRemainingRestSeconds(timer: RestTimer | null, nowMs = Date.now()): number {
  nonnegative(nowMs, 'Current time');
  return timer === null ? 0 : Math.min(timer.durationSeconds, Math.max(0, Math.ceil((timer.endsAtMs - nowMs) / 1000)));
}

export function createWorkoutStore(options: { now?: () => number; repository?: TrackingRepository; beforeChange?: (next: WorkoutState, previous: WorkoutState) => void; durable?: boolean } = {}) {
  const now = options.now ?? Date.now;
  let generation = 0;
  let inFlight = false;
  const repo = async () => options.repository ?? (await import('../api/trackingRepository')).getTrackingRepository();
  return createStore<WorkoutStore>()((rawSet, get) => {
    const set = (patch: Partial<WorkoutStore> | ((state: WorkoutStore) => Partial<WorkoutStore>)) => {
      const previous = get(); const delta = typeof patch === 'function' ? patch(previous) : patch;
      options.beforeChange?.({ ...previous, ...delta }, previous);
      rawSet(delta);
    };
    return ({
    ...initialState(),
    startSession: (input) => {
      if (get().activeSession) throw new Error('Finish or reset the current session before starting another.');
      requireId(input.id);
      if (!input.name.trim()) throw new TypeError('A session name is required.');
      const startedAtMs = input.startedAtMs ?? now();
      nonnegative(startedAtMs, 'Session start');
      set({ ...initialState(), pendingWorkouts: get().pendingWorkouts, importedWorkouts: get().importedWorkouts, activeSession: { id: input.id, name: input.name, startedAtMs } });
    },
    addExercise: (input) => {
      const state = get();
      requireSession(state);
      requireId(input.id);
      requireId(input.exercise.id);
      if (!input.exercise.name.trim()) throw new TypeError('An exercise name is required.');
      if (state.exerciseSequence.some((exercise) => exercise.id === input.id)) throw new Error('Duplicate exercise instance ID.');
      validateRestDuration(input.defaultRestSeconds);
      const exercise: SessionExercise = { ...input, exercise: { ...input.exercise } };
      if (exercise.note !== undefined) {
        const trimmed = exercise.note.trim();
        if (trimmed.length > MAX_EXERCISE_NOTE) throw new RangeError(`A note is at most ${MAX_EXERCISE_NOTE} characters.`);
        if (trimmed) exercise.note = trimmed; else delete exercise.note;
      }
      set({
        exerciseSequence: [...state.exerciseSequence, exercise],
        activeExerciseId: state.activeExerciseId ?? input.id,
      });
    },
    removeExercise: (id) => {
      const state = get();
      const exerciseSequence = prune(state.exerciseSequence.filter((exercise) => exercise.id !== id));
      const removedSetIds = new Set(state.sets.filter((entry) => entry.sessionExerciseId === id).map((entry) => entry.id));
      set({
        exerciseSequence,
        sets: state.sets.filter((entry) => entry.sessionExerciseId !== id),
        activeExerciseId: state.activeExerciseId === id ? (exerciseSequence[0]?.id ?? null) : state.activeExerciseId,
        restTimer: state.restTimer?.sourceSetId && removedSetIds.has(state.restTimer.sourceSetId) ? null : state.restTimer,
      });
    },
    replaceExercise: (id, exercise, defaultRestSeconds) => {
      const state = get();
      requireSession(state);
      requireId(exercise.id);
      if (!exercise.name.trim()) throw new TypeError('An exercise name is required.');
      const current = state.exerciseSequence.find((entry) => entry.id === id);
      if (!current) throw new Error('Unknown exercise instance.');
      const rest = defaultRestSeconds ?? current.defaultRestSeconds;
      validateRestDuration(rest);
      // The note described the lift being replaced, so it goes with it. Its place in a superset
      // is about the slot, not the lift, so that stays.
      const next: SessionExercise = { id, exercise: { ...exercise }, defaultRestSeconds: rest,
        ...(current.supersetId ? { supersetId: current.supersetId } : {}) };
      const removedSetIds = new Set(state.sets.filter((entry) => entry.sessionExerciseId === id).map((entry) => entry.id));
      set({
        exerciseSequence: state.exerciseSequence.map((entry) => entry.id === id ? next : entry),
        // Same number of slots to work through, none of them carrying the old lift's numbers.
        sets: state.sets.map((entry) => entry.sessionExerciseId === id
          ? { ...entry, weightLbs: null, reps: null, rpe: null, estimatedOneRepMaxLbs: null, restSeconds: rest, completedAtMs: null }
          : entry),
        restTimer: state.restTimer?.sourceSetId && removedSetIds.has(state.restTimer.sourceSetId) ? null : state.restTimer,
      });
    },
    setExerciseNote: (id, note) => {
      const state = get();
      const current = state.exerciseSequence.find((entry) => entry.id === id);
      if (!current) throw new Error('Unknown exercise instance.');
      const trimmed = note.trim();
      if (trimmed.length > MAX_EXERCISE_NOTE) throw new RangeError(`A note is at most ${MAX_EXERCISE_NOTE} characters.`);
      const { note: _previous, ...rest } = current;
      set({ exerciseSequence: state.exerciseSequence.map((entry) => entry.id === id
        ? (trimmed ? { ...rest, note: trimmed } : rest) : entry) });
    },
    groupSuperset: (ids, supersetId) => {
      const state = get();
      requireSession(state);
      const id = supersetId ?? `superset-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      requireId(id);
      set({ exerciseSequence: assignSuperset(state.exerciseSequence, ids, id) });
    },
    ungroupSuperset: (supersetId) => {
      const state = get();
      requireSession(state);
      set({ exerciseSequence: clearSuperset(state.exerciseSequence, supersetId) });
    },
    reorderExercises: (ids) => {
      const state = get();
      requireSession(state);
      const exercises = new Map(state.exerciseSequence.map((exercise) => [exercise.id, exercise]));
      if (ids.length !== exercises.size || new Set(ids).size !== ids.length || ids.some((id) => !exercises.has(id))) {
        throw new Error('The reordered sequence must contain every exercise instance exactly once.');
      }
      set({ exerciseSequence: ids.map((id) => exercises.get(id)!) });
    },
    setActiveExercise: (id) => {
      if (!get().exerciseSequence.some((exercise) => exercise.id === id)) throw new Error('Unknown exercise instance.');
      set({ activeExerciseId: id });
    },
    addSet: (input) => {
      const state = get();
      requireSession(state);
      requireId(input.id);
      const exercise = state.exerciseSequence.find((entry) => entry.id === input.sessionExerciseId);
      if (!exercise) throw new Error('Unknown exercise instance.');
      if (state.sets.some((entry) => entry.id === input.id)) throw new Error('Duplicate set ID.');
      const entry: WorkoutSet = {
        id: input.id,
        sessionExerciseId: input.sessionExerciseId,
        weightLbs: input.weightLbs ?? null,
        reps: input.reps ?? null,
        rpe: input.rpe ?? null,
        durationSeconds: input.durationSeconds ?? null,
        distanceMeters: input.distanceMeters ?? null,
        kind: input.kind ?? 'normal',
        restSeconds: input.restSeconds ?? exercise.defaultRestSeconds,
        estimatedOneRepMaxLbs: input.estimatedOneRepMaxLbs ?? null,
        completedAtMs: null,
      };
      validateSet(entry, exercise);
      set({ sets: [...state.sets, entry] });
    },
    updateSet: (id, update) => {
      const state = get();
      const original = state.sets.find((entry) => entry.id === id);
      if (!original) throw new Error('Unknown set.');
      // Ignore optional undefined values; preserve identity and completion fields.
      const exercise = state.exerciseSequence.find((entry) => entry.id === original.sessionExerciseId);
      const next: WorkoutSet = {
        ...original,
        weightLbs: update.weightLbs === undefined ? original.weightLbs : update.weightLbs,
        reps: update.reps === undefined ? original.reps : update.reps,
        rpe: update.rpe === undefined ? original.rpe : update.rpe,
        durationSeconds: update.durationSeconds === undefined ? original.durationSeconds : update.durationSeconds,
        distanceMeters: update.distanceMeters === undefined ? original.distanceMeters : update.distanceMeters,
        kind: update.kind ?? original.kind,
        restSeconds: update.restSeconds ?? original.restSeconds,
        estimatedOneRepMaxLbs: update.estimatedOneRepMaxLbs === undefined ? original.estimatedOneRepMaxLbs : update.estimatedOneRepMaxLbs,
      };
      validateSet(next, exercise);
      const missing = next.completedAtMs === null ? null : missingFor(next, trackingTypeOf(exercise?.exercise));
      if (missing) throw new Error(missing);
      set({ sets: state.sets.map((entry) => entry.id === id ? next : entry) });
    },
    removeSet: (id) => set((state) => ({
      sets: state.sets.filter((entry) => entry.id !== id),
      restTimer: state.restTimer?.sourceSetId === id ? null : state.restTimer,
    })),
    completeSet: (id, completedAtMs = now()) => {
      const state = get();
      validateTimestamp(completedAtMs, requireSession(state));
      const entry = state.sets.find((candidate) => candidate.id === id);
      if (!entry) throw new Error('Unknown set.');
      if (entry.completedAtMs !== null) return;
      const exercise = state.exerciseSequence.find((candidate) => candidate.id === entry.sessionExerciseId);
      const missing = missingFor(entry, trackingTypeOf(exercise?.exercise));
      if (missing) throw new Error(missing);
      const sets = state.sets.map((candidate) => candidate.id === id ? { ...candidate, completedAtMs } : candidate);
      // Resting between the halves of a superset would make it two straight exercises with
      // extra steps, so the timer waits for the round to finish.
      const rests = restsAfter(state.exerciseSequence, sets, id);
      const next = rests ? null : nextAfterSet(state.exerciseSequence, sets, id);
      set({
        sets,
        restTimer: rests ? makeTimer(entry.restSeconds, completedAtMs, id) : state.restTimer,
        activeExerciseId: next ?? state.activeExerciseId,
      });
    },
    startRestTimer: (durationSeconds, startedAtMs = now()) => {
      validateTimestamp(startedAtMs, requireSession(get()));
      set({ restTimer: makeTimer(durationSeconds, startedAtMs, null) });
    },
    clearRestTimer: () => set({ restTimer: null }),
    clearExpiredRestTimer: (nowMs = now()) => set((state) =>
      state.restTimer && getRemainingRestSeconds(state.restTimer, nowMs) === 0 ? { restTimer: null } : state),
    finishSession: (endedAtMs = now()) => {
      const state = get();
      const session = requireSession(state);
      validateTimestamp(endedAtMs, session);
      if (state.sets.some((entry) => entry.completedAtMs !== null && entry.completedAtMs > endedAtMs)) {
        throw new RangeError('Session end precedes a completed set.');
      }
      const completed: CompletedWorkout = {
        session: { ...session },
        endedAtMs,
        exercises: state.exerciseSequence.map((entry) => ({ ...entry, exercise: { ...entry.exercise } })),
        sets: state.sets.map((entry) => ({ ...entry })),
      };
      const queued = JSON.parse(JSON.stringify(completed)) as CompletedWorkout;
      set({ ...initialState(), pendingWorkouts: [...state.pendingWorkouts, { workout: queued, ownerId: null }] });
      return completed;
    },
    cancelSession: () => {
      requireSession(get());
      // Workouts already queued for upload are somebody else's completed sessions.
      set({ ...initialState(), pendingWorkouts: get().pendingWorkouts, importedWorkouts: get().importedWorkouts });
    },
    savePendingWorkouts: async () => {
      if (options.durable && syncBridge.drain) return syncBridge.drain();
      if (inFlight || !get().pendingWorkouts.length) return;
      inFlight = true; const token = generation; set({ syncStatus: 'saving', syncError: null });
      try {
        const db = await repo(); const owner = await db.userId();
        if (token !== generation) return;
        for (const pending of get().pendingWorkouts) {
          if (pending.ownerId && pending.ownerId !== owner) throw new Error('Sign in to the original account to retry this workout.');
          if (token !== generation) return;
          set(state => ({ pendingWorkouts: state.pendingWorkouts.map(item => item.workout === pending.workout ? { ...item, ownerId: owner } : item) }));
          await db.saveWorkout(owner, pending.workout);
          if (token !== generation) return;
          set(state => ({ pendingWorkouts: state.pendingWorkouts.filter(item => item.workout !== pending.workout) }));
        }
        set({ syncStatus: get().pendingWorkouts.length ? 'idle' : 'saved' });
      } catch (error) { if (token === generation) set({ syncStatus: 'error', syncError: error instanceof Error ? error.message : 'Workout save failed.' }); }
      finally { inFlight = false; }
    },
    reset: () => { generation++; set(initialState()); },
  }); });
}

export const workoutStore = createWorkoutStore({ durable: true, beforeChange: (next, previous) => syncBridge.workout?.(next, previous) });

export function useWorkoutStore<T>(selector: (state: WorkoutStore) => T): T {
  return useStore(workoutStore, selector);
}
