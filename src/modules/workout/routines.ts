import { exerciseById } from './catalog';
import { SUPERSET_LIMIT } from './supersets';
import { MAX_EXERCISE_NOTE } from '../../types/workout';
import type { RoutineExercise } from './volume';
export type { RoutineExercise };
export interface WorkoutRoutine {
  id: string;
  name: string;
  /** Kept in sync with `exercises` for the database column and its visibility trigger. */
  exerciseIds: string[];
  /** Per-exercise sets, rest and rep range. Absent on routines saved before this existed. */
  exercises?: RoutineExercise[];
  /** How often this routine runs in a week; drives the weekly volume calculation. */
  timesPerWeek?: number;
}
export const DEFAULT_REST_SECONDS = 120;
export const REST_CHOICES = [30, 45, 60, 90, 120, 150, 180, 240, 300] as const;
export function defaultRoutineExercise(exerciseId: string): RoutineExercise {
  return { exerciseId, sets: 3, restSeconds: DEFAULT_REST_SECONDS, repLow: 6, repHigh: 12 };
}
export function validateRoutine(routine: WorkoutRoutine) {
  if (!/^[0-9a-f-]{36}$/i.test(routine.id) || !routine.name.trim() || routine.name.trim().length > 80) throw new Error('Name your routine (1–80 characters).');
  if (!routine.exerciseIds.length || routine.exerciseIds.length > 30 || new Set(routine.exerciseIds).size !== routine.exerciseIds.length || routine.exerciseIds.some(id => !exerciseById(id))) throw new Error('Choose 1–30 distinct catalog exercises.');
  if (routine.timesPerWeek !== undefined && (!Number.isInteger(routine.timesPerWeek) || routine.timesPerWeek < 1 || routine.timesPerWeek > 7)) throw new Error('A routine runs between 1 and 7 times a week.');
  if (routine.exercises) {
    if (routine.exercises.length !== routine.exerciseIds.length
      || routine.exercises.some((entry, index) => entry.exerciseId !== routine.exerciseIds[index])) throw new Error('Routine details must match its exercises.');
    for (const entry of routine.exercises) {
      if (!Number.isInteger(entry.sets) || entry.sets < 1 || entry.sets > 20) throw new Error('Each exercise needs 1–20 sets.');
      if (!Number.isInteger(entry.restSeconds) || entry.restSeconds < 0 || entry.restSeconds > 600) throw new Error('Rest must be between 0 and 10 minutes.');
      if (!Number.isInteger(entry.repLow) || !Number.isInteger(entry.repHigh) || entry.repLow < 1 || entry.repHigh > 100 || entry.repLow > entry.repHigh) throw new Error('Enter a rep range from low to high, up to 100.');
      if (entry.supersetId !== undefined && (typeof entry.supersetId !== 'string' || !entry.supersetId.trim() || entry.supersetId.length > 64)) {
        throw new Error('A superset has an invalid identifier.');
      }
      // The same bound the session note carries, because this is what fills it.
      if (entry.note !== undefined && (typeof entry.note !== 'string' || entry.note.trim().length > MAX_EXERCISE_NOTE)) {
        throw new Error(`A note is at most ${MAX_EXERCISE_NOTE} characters.`);
      }
    }
    for (const group of routineSupersets(routine.exercises)) {
      if (group.exerciseIds.length < 2) throw new Error('A superset needs at least two exercises.');
      if (group.exerciseIds.length > SUPERSET_LIMIT) throw new Error(`A superset holds at most ${SUPERSET_LIMIT} exercises.`);
      // Contiguity is the pairing: an exercise between two partners is not done back to back
      // with them, so a plan that claims otherwise is not one a session could honour.
      const positions = group.exerciseIds.map(id => routine.exercises!.findIndex(entry => entry.exerciseId === id));
      if (Math.max(...positions) - Math.min(...positions) !== positions.length - 1) {
        throw new Error('Supersetted exercises must sit together in the routine.');
      }
    }
  }
}
/** Older routines carry only ids; give them sensible defaults rather than refusing to open. */
export function routineExercises(routine: WorkoutRoutine): RoutineExercise[] {
  return routine.exercises ?? routine.exerciseIds.map(defaultRoutineExercise);
}

/**
 * Supersets in a routine. Members are held contiguous, because that is what the pairing means:
 * an exercise sitting between two partners cannot be something you do back to back with them.
 * Grouping therefore moves members together rather than tagging them where they lie.
 */
export function groupRoutineSuperset(entries: readonly RoutineExercise[], exerciseIds: readonly string[], supersetId: string): RoutineExercise[] {
  const wanted = new Set(exerciseIds);
  if (wanted.size < 2) throw new Error('A superset needs at least two exercises.');
  if (wanted.size > SUPERSET_LIMIT) throw new Error(`A superset holds at most ${SUPERSET_LIMIT} exercises.`);
  if ([...wanted].some(id => !entries.some(entry => entry.exerciseId === id))) throw new Error('That exercise is not in this routine.');
  // Any member already in another group leaves it; belonging to both would be meaningless.
  const tagged = entries.map(entry => wanted.has(entry.exerciseId)
    ? { ...entry, supersetId }
    : entry.supersetId === supersetId ? strip(entry) : entry);
  const members = tagged.filter(entry => wanted.has(entry.exerciseId));
  const rest = tagged.filter(entry => !wanted.has(entry.exerciseId));
  // Reinserted where the first member was, so the routine keeps the shape you built.
  const at = tagged.findIndex(entry => wanted.has(entry.exerciseId));
  const before = rest.slice(0, tagged.slice(0, at).filter(entry => !wanted.has(entry.exerciseId)).length);
  return pruneRoutineSupersets([...before, ...members, ...rest.slice(before.length)]);
}

export function clearRoutineSuperset(entries: readonly RoutineExercise[], supersetId: string): RoutineExercise[] {
  return entries.map(entry => entry.supersetId === supersetId ? strip(entry) : entry);
}

/** A group of one is not a superset; removing an exercise can leave a partner stranded. */
export function pruneRoutineSupersets(entries: readonly RoutineExercise[]): RoutineExercise[] {
  const counts = new Map<string, number>();
  for (const entry of entries) if (entry.supersetId) counts.set(entry.supersetId, (counts.get(entry.supersetId) ?? 0) + 1);
  return entries.map(entry => entry.supersetId && counts.get(entry.supersetId)! < 2 ? strip(entry) : entry);
}

const strip = (entry: RoutineExercise) => { const { supersetId: _gone, ...rest } = entry; return rest; };

/** Each group in routine order, which is the order a session will run them in. */
export function routineSupersets(entries: readonly RoutineExercise[]): { id: string; exerciseIds: string[] }[] {
  const seen = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.supersetId) continue;
    seen.set(entry.supersetId, [...(seen.get(entry.supersetId) ?? []), entry.exerciseId]);
  }
  return [...seen].map(([id, exerciseIds]) => ({ id, exerciseIds }));
}

/**
 * Consecutive runs of the same superset. Validation holds members contiguous, so a run is the
 * group — and treating a group as one block is what lets a reorder move it without splitting it.
 */
function blocksOf(entries: readonly RoutineExercise[]): RoutineExercise[][] {
  const blocks: RoutineExercise[][] = [];
  for (const entry of entries) {
    const last = blocks.at(-1);
    if (last && entry.supersetId && last[0].supersetId === entry.supersetId) last.push(entry);
    else blocks.push([entry]);
  }
  return blocks;
}

/**
 * Moves an exercise one place earlier or later. Two behaviours, because a superset makes them
 * different questions: moving against a partner reorders the pair itself, while moving past
 * anything else takes the whole group along. Neither can leave a group split, so a routine
 * cannot be reordered into a state its own validation would reject.
 */
export function moveRoutineExercise(entries: readonly RoutineExercise[], exerciseId: string, delta: -1 | 1): RoutineExercise[] {
  const index = entries.findIndex(entry => entry.exerciseId === exerciseId);
  if (index < 0) throw new Error('That exercise is not in this routine.');
  const entry = entries[index];
  const neighbour = entries[index + delta];
  if (neighbour && entry.supersetId && neighbour.supersetId === entry.supersetId) {
    const next = [...entries];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    return next;
  }
  const blocks = blocksOf(entries);
  const at = blocks.findIndex(block => block.some(item => item.exerciseId === exerciseId));
  const target = at + delta;
  // Already at the end; a no-op rather than an error, because the button is simply disabled.
  if (target < 0 || target >= blocks.length) return [...entries];
  const next = [...blocks];
  [next[at], next[target]] = [next[target], next[at]];
  return next.flat();
}

/** Whether a move would do anything, which is what greys the button out. */
export function canMoveRoutineExercise(entries: readonly RoutineExercise[], exerciseId: string, delta: -1 | 1): boolean {
  const moved = moveRoutineExercise(entries, exerciseId, delta);
  return moved.some((entry, index) => entry.exerciseId !== entries[index].exerciseId);
}

/**
 * Swaps the lift in a slot, keeping its sets, rest, rep range and its place in any superset —
 * the plan belongs to the slot, not to the exercise that happens to be filling it.
 */
export function replaceRoutineExercise(entries: readonly RoutineExercise[], exerciseId: string, replacementId: string): RoutineExercise[] {
  if (exerciseId === replacementId) return [...entries];
  if (!entries.some(entry => entry.exerciseId === exerciseId)) throw new Error('That exercise is not in this routine.');
  // A routine holds distinct exercises, so swapping onto one already here would collapse two
  // slots into one and lose the other's sets.
  if (entries.some(entry => entry.exerciseId === replacementId)) throw new Error('That exercise is already in this routine.');
  if (!exerciseById(replacementId)) throw new Error('That exercise is not in the catalogue.');
  return entries.map(entry => entry.exerciseId === exerciseId ? { ...entry, exerciseId: replacementId } : entry);
}


/** An empty or blank note removes it rather than storing whitespace, as in a live session. */
export function setRoutineNote(entries: readonly RoutineExercise[], exerciseId: string, note: string): RoutineExercise[] {
  const trimmed = note.trim();
  if (trimmed.length > MAX_EXERCISE_NOTE) throw new RangeError(`A note is at most ${MAX_EXERCISE_NOTE} characters.`);
  if (!entries.some(entry => entry.exerciseId === exerciseId)) throw new Error('That exercise is not in this routine.');
  return entries.map(entry => {
    if (entry.exerciseId !== exerciseId) return entry;
    const { note: _previous, ...rest } = entry;
    return trimmed ? { ...rest, note: trimmed } : rest;
  });
}
