import rows from './catalog.json';
import { trackingTypeFor } from './trackingTypes';
import type { ExerciseDefinition } from '../../types/workout';
export interface CatalogExercise extends ExerciseDefinition { primaryMuscle: string; description: string }
/** Tracking type is resolved once, here, so nothing downstream has to ask how a lift is measured. */
export const EXERCISE_CATALOG: CatalogExercise[] = rows.map(row => ({ ...row, trackingType: trackingTypeFor(row) }));

/**
 * The user's own exercises, kept beside the shared catalogue rather than merged into it.
 *
 * `exerciseById` is called from routines, history, personal records and the volume calculation
 * — everywhere a stored exercise ID has to become a name again. A custom lift has to resolve in
 * all of those or a routine built around it would show "Exercise" forever, so the registry is
 * refreshed whenever the account's data is loaded and every one of those call sites keeps
 * working unchanged.
 */
let custom: readonly CatalogExercise[] = [];
export function registerCustomExercises(exercises: readonly CatalogExercise[]) { custom = exercises; }
export const customExercises = () => custom;
/** The shared catalogue plus anything this account added, which is what a picker should show. */
export const fullCatalog = (): CatalogExercise[] => [...EXERCISE_CATALOG, ...custom];
export const exerciseById = (id: string) =>
  EXERCISE_CATALOG.find(e => e.id === id) ?? custom.find(e => e.id === id);
