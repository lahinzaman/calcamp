import { EXERCISE_CATALOG, type CatalogExercise } from './catalog';
import { MUSCLE_LABELS } from './volume';

export const PATTERN_LABELS: Record<string, string> = {
  horizontal_push: 'Horizontal push', vertical_push: 'Vertical push', horizontal_pull: 'Horizontal pull',
  vertical_pull: 'Vertical pull', horizontal_adduction: 'Chest fly', horizontal_abduction: 'Rear fly',
  shoulder_abduction: 'Lateral raise', shoulder_shrug: 'Shrug', elbow_flexion: 'Curl', elbow_extension: 'Triceps extension',
  wrist_flexion: 'Wrist curl', wrist_extension: 'Reverse wrist curl', squat: 'Squat', lunge: 'Lunge',
  hip_hinge: 'Hinge', hip_extension: 'Hip extension', hip_adduction: 'Hip adduction', hip_abduction: 'Hip abduction',
  knee_extension: 'Knee extension', knee_flexion: 'Knee flexion', plantar_flexion: 'Calf raise',
  trunk_flexion: 'Trunk flexion', trunk_rotation: 'Rotation', lateral_flexion: 'Side bend',
  anti_extension: 'Anti-extension', spinal_extension: 'Back extension', carry: 'Carry',
};
export const patternLabel = (pattern: string) => PATTERN_LABELS[pattern] ?? pattern.replace(/_/g, ' ');
export const muscleLabel = (muscle: string) => MUSCLE_LABELS[muscle] ?? muscle.replace(/_/g, ' ');
const equipmentLabel = (equipment: string) => equipment[0].toUpperCase() + equipment.slice(1);

export interface Facet { value: string; label: string; count: number }
/** Facets are built from the catalogue itself, so a new exercise needs no extra wiring. */
function facet(read: (exercise: CatalogExercise) => string, label: (value: string) => string,
  catalog: readonly CatalogExercise[]): Facet[] {
  const counts = new Map<string, number>();
  for (const exercise of catalog) counts.set(read(exercise), (counts.get(read(exercise)) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, label: label(value), count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
export const muscleFacets = (catalog: readonly CatalogExercise[] = EXERCISE_CATALOG) =>
  facet(exercise => exercise.primaryMuscle, muscleLabel, catalog);
export const equipmentFacets = (catalog: readonly CatalogExercise[] = EXERCISE_CATALOG) =>
  facet(exercise => exercise.equipment ?? 'other', equipmentLabel, catalog);
export const patternFacets = (catalog: readonly CatalogExercise[] = EXERCISE_CATALOG) =>
  facet(exercise => exercise.movementPattern ?? 'other', patternLabel, catalog);

export interface ExerciseFilters { query?: string; muscles?: readonly string[]; equipment?: readonly string[]; patterns?: readonly string[] }
const haystack = (exercise: CatalogExercise) => [exercise.name, muscleLabel(exercise.primaryMuscle), exercise.primaryMuscle,
  exercise.equipment ?? '', patternLabel(exercise.movementPattern ?? ''), exercise.movementPattern ?? ''].join(' ').toLowerCase();

/**
 * Every search word must match somewhere, so "cable row" narrows instead of widening.
 * Chips within one facet are an OR; across facets they are an AND — picking Chest and
 * Dumbbell means dumbbell chest work, not everything that is either.
 */
export function filterExercises(catalog: readonly CatalogExercise[], filters: ExerciseFilters): CatalogExercise[] {
  const terms = (filters.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const muscles = filters.muscles ?? [], equipment = filters.equipment ?? [], patterns = filters.patterns ?? [];
  return catalog.filter(exercise => {
    if (muscles.length && !muscles.includes(exercise.primaryMuscle)) return false;
    if (equipment.length && !equipment.includes(exercise.equipment ?? 'other')) return false;
    if (patterns.length && !patterns.includes(exercise.movementPattern ?? 'other')) return false;
    if (!terms.length) return true;
    const text = haystack(exercise);
    return terms.every(term => text.includes(term));
  });
}
export const activeFilterCount = (filters: ExerciseFilters) =>
  (filters.muscles?.length ?? 0) + (filters.equipment?.length ?? 0) + (filters.patterns?.length ?? 0);
