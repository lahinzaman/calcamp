import { exerciseById } from './catalog';
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
    }
  }
}
/** Older routines carry only ids; give them sensible defaults rather than refusing to open. */
export function routineExercises(routine: WorkoutRoutine): RoutineExercise[] {
  return routine.exercises ?? routine.exerciseIds.map(defaultRoutineExercise);
}
