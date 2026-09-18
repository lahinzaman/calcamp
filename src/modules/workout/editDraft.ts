import { MAX_EXERCISE_NOTE } from '../../store/workoutStore';
import { estimateBrzyckiOneRepMax } from './oneRepMax';
import type { CompletedWorkout, ExerciseDefinition, WorkoutSet } from '../../types/workout';

/**
 * Editing a session that has already finished. The live store cannot be reused for this: it
 * holds exactly one session, the one in progress, and half its rules are about a workout that
 * is still happening. These are plain functions over a detached snapshot instead, so a history
 * screen can revise a session from last March without disturbing the one you are doing now.
 *
 * Only completed sets are kept when a session is saved, so every row here is a logged set:
 * there is no "waiting to be done" state left to represent.
 */
export interface SetEdit { weightLbs: number | null; reps: number | null; rpe: number | null; isWarmup: boolean }

const newId = () => `edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function validateSetEdit(edit: SetEdit): string | null {
  if (edit.weightLbs === null || !Number.isFinite(edit.weightLbs) || edit.weightLbs < 0) return 'Enter a weight of 0 lbs or more.';
  if (edit.reps === null || !Number.isInteger(edit.reps) || edit.reps < 1 || edit.reps > 1000) return 'Enter whole reps from 1 to 1000.';
  if (edit.rpe !== null && (!Number.isFinite(edit.rpe) || edit.rpe < 1 || edit.rpe > 10)) return 'RPE runs from 1 to 10, or leave it empty.';
  return null;
}

export function editSet(draft: CompletedWorkout, setId: string, edit: SetEdit): CompletedWorkout {
  const problem = validateSetEdit(edit);
  if (problem) throw new RangeError(problem);
  return { ...draft, sets: draft.sets.map(entry => entry.id === setId
    ? { ...entry, ...edit, estimatedOneRepMaxLbs: estimateBrzyckiOneRepMax(edit.weightLbs, edit.reps) }
    : entry) };
}

export function removeSet(draft: CompletedWorkout, setId: string): CompletedWorkout {
  return { ...draft, sets: draft.sets.filter(entry => entry.id !== setId) };
}

/** A new row copies the last set of that exercise, which is nearly always what it should say. */
export function addSet(draft: CompletedWorkout, sessionExerciseId: string): CompletedWorkout {
  const slot = draft.exercises.find(entry => entry.id === sessionExerciseId);
  if (!slot) throw new Error('Unknown exercise.');
  const siblings = draft.sets.filter(entry => entry.sessionExerciseId === sessionExerciseId);
  const previous = siblings.at(-1);
  const entry: WorkoutSet = {
    id: newId(), sessionExerciseId,
    weightLbs: previous?.weightLbs ?? null, reps: previous?.reps ?? null, rpe: null,
    isWarmup: previous?.isWarmup ?? false, restSeconds: slot.defaultRestSeconds,
    estimatedOneRepMaxLbs: previous?.estimatedOneRepMaxLbs ?? null,
    // A set added afterwards is dated to the session it belongs to, not to today.
    completedAtMs: previous?.completedAtMs ?? draft.endedAtMs,
  };
  // Inserted beside its siblings so exercise order in the saved session stays contiguous.
  const at = draft.sets.findLastIndex(item => item.sessionExerciseId === sessionExerciseId);
  const sets = [...draft.sets];
  sets.splice(at < 0 ? sets.length : at + 1, 0, entry);
  return { ...draft, sets };
}

export function removeExercise(draft: CompletedWorkout, sessionExerciseId: string): CompletedWorkout {
  return {
    ...draft,
    exercises: draft.exercises.filter(entry => entry.id !== sessionExerciseId),
    sets: draft.sets.filter(entry => entry.sessionExerciseId !== sessionExerciseId),
  };
}

export function addExercise(draft: CompletedWorkout, exercise: ExerciseDefinition, defaultRestSeconds = 120): CompletedWorkout {
  const id = newId();
  return addSet({ ...draft, exercises: [...draft.exercises, { id, exercise: { ...exercise }, defaultRestSeconds }] }, id);
}

export function setNote(draft: CompletedWorkout, sessionExerciseId: string, note: string): CompletedWorkout {
  const trimmed = note.trim();
  if (trimmed.length > MAX_EXERCISE_NOTE) throw new RangeError(`A note is at most ${MAX_EXERCISE_NOTE} characters.`);
  return { ...draft, exercises: draft.exercises.map(entry => {
    if (entry.id !== sessionExerciseId) return entry;
    const { note: _previous, ...rest } = entry;
    return trimmed ? { ...rest, note: trimmed } : rest;
  }) };
}

export function rename(draft: CompletedWorkout, name: string): CompletedWorkout {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new RangeError('Name this session, in 1 to 80 characters.');
  return { ...draft, session: { ...draft.session, name: trimmed } };
}

/** What stops a save that would be rejected by the store, the schema, or both. */
export function validateDraft(draft: CompletedWorkout): string | null {
  if (!draft.session.name.trim()) return 'Name this session before saving.';
  if (!draft.exercises.length) return 'A session needs at least one exercise. Delete it instead if it should not be there.';
  for (const entry of draft.sets) {
    const problem = validateSetEdit(entry);
    if (problem) return problem;
  }
  const orphan = draft.sets.find(entry => !draft.exercises.some(slot => slot.id === entry.sessionExerciseId));
  if (orphan) return 'A set belongs to an exercise that is no longer here.';
  if (!draft.sets.length) return 'A session needs at least one set. Delete it instead if it should not be there.';
  return null;
}
