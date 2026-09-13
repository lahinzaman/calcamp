import rows from './catalog.json';
import type { ExerciseDefinition } from '../../types/workout';
export interface CatalogExercise extends ExerciseDefinition { primaryMuscle: string; description: string }
export const EXERCISE_CATALOG: CatalogExercise[] = rows;
export const exerciseById = (id: string) => EXERCISE_CATALOG.find(e => e.id === id);
