import { exerciseById } from './catalog';
export interface WorkoutRoutine { id: string; name: string; exerciseIds: string[] }
export function validateRoutine(routine: WorkoutRoutine) {
  if (!/^[0-9a-f-]{36}$/i.test(routine.id) || !routine.name.trim() || routine.name.trim().length > 80) throw new Error('Name your routine (1–80 characters).');
  if (!routine.exerciseIds.length || routine.exerciseIds.length > 30 || new Set(routine.exerciseIds).size !== routine.exerciseIds.length || routine.exerciseIds.some(id => !exerciseById(id))) throw new Error('Choose 1–30 distinct catalog exercises.');
}
