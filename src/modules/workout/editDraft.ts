import { MAX_EXERCISE_NOTE } from '../../store/workoutStore';
import { estimateBrzyckiOneRepMax } from './oneRepMax';
import { missingFor, outOfRange, supportsOneRepMax, trackingTypeOf } from './setShape';
import type { CompletedWorkout, ExerciseDefinition, SetKind, WorkoutSet } from '../../types/workout';

/**
 * Editing a session that has already finished. The live store cannot be reused for this: it
 * holds exactly one session, the one in progress, and half its rules are about a workout that
 * is still happening. These are plain functions over a detached snapshot instead, so a history
 * screen can revise a session from last March without disturbing the one you are doing now.
 *
 * Only completed sets are kept when a session is saved, so every row here is a logged set:
 * there is no "waiting to be done" state left to represent.
 */
export interface SetEdit {
  weightLbs: number | null; reps: number | null; rpe: number | null;
  durationSeconds: number | null; distanceMeters: number | null; kind: SetKind;
}
const trackingFor = (draft: CompletedWorkout, sessionExerciseId: string) =>
  trackingTypeOf(draft.exercises.find(entry => entry.id === sessionExerciseId)?.exercise);

const newId = () => `edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Every row here is a set that was logged, so what the exercise measures has to be present. */
export function validateSetEdit(edit: SetEdit, trackingType = trackingTypeOf(undefined)): string | null {
  return outOfRange(edit) ?? missingFor(edit, trackingType);
}

export function editSet(draft: CompletedWorkout, setId: string, edit: SetEdit): CompletedWorkout {
  const original = draft.sets.find(entry => entry.id === setId);
  if (!original) throw new Error('Unknown set.');
  const trackingType = trackingFor(draft, original.sessionExerciseId);
  const problem = validateSetEdit(edit, trackingType);
  if (problem) throw new RangeError(problem);
  return { ...draft, sets: draft.sets.map(entry => entry.id === setId
    ? { ...entry, ...edit, estimatedOneRepMaxLbs: supportsOneRepMax(trackingType) ? estimateBrzyckiOneRepMax(edit.weightLbs, edit.reps) : null }
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
    durationSeconds: previous?.durationSeconds ?? null, distanceMeters: previous?.distanceMeters ?? null,
    kind: previous?.kind ?? 'normal', restSeconds: slot.defaultRestSeconds,
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
    const problem = validateSetEdit(entry, trackingFor(draft, entry.sessionExerciseId));
    if (problem) return problem;
  }
  const orphan = draft.sets.find(entry => !draft.exercises.some(slot => slot.id === entry.sessionExerciseId));
  if (orphan) return 'A set belongs to an exercise that is no longer here.';
  if (!draft.sets.length) return 'A session needs at least one set. Delete it instead if it should not be there.';
  return null;
}
