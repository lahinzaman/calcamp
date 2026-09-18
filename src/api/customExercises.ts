import { getSupabase } from './supabase';
import { PATTERN_LABELS } from '../modules/workout/search';
import { MUSCLE_LABELS } from '../modules/workout/volume';
import { TRACKING_TYPES } from '../modules/workout/setShape';
import type { CatalogExercise } from '../modules/workout/catalog';
import type { TrackingType } from '../types/workout';

/**
 * A lift the user created. The `exercises` table has carried an `owner_user_id` and an
 * `is_archived` flag since the beginning — a private variation was always part of the design
 * and the app simply never wrote one.
 *
 * Archiving rather than deleting is deliberate and enforced by the schema: sets reference
 * exercises, so removing one would strand history that says it happened.
 */
export interface CustomExercise {
  id: string;
  name: string;
  primaryMuscle: string;
  movementPattern: string;
  equipment: string;
  trackingType: TrackingType;
  defaultRestSeconds: number;
  notes?: string;
}

export const EQUIPMENT_CHOICES = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'free weight', 'other'] as const;
export const MAX_CUSTOM_NAME = 80;

export function validateCustomExercise(exercise: CustomExercise) {
  if (!/^[0-9a-f-]{36}$/i.test(exercise.id)) throw new Error('This exercise has an invalid identifier.');
  const name = exercise.name.trim();
  if (!name || name.length > MAX_CUSTOM_NAME) throw new Error(`Name your exercise, in 1 to ${MAX_CUSTOM_NAME} characters.`);
  if (!MUSCLE_LABELS[exercise.primaryMuscle]) throw new Error('Choose the muscle this exercise trains.');
  // The pattern is what routes assisting work to the right muscles, so it cannot be freeform.
  if (!PATTERN_LABELS[exercise.movementPattern]) throw new Error('Choose the movement this exercise belongs to.');
  if (!EQUIPMENT_CHOICES.includes(exercise.equipment as typeof EQUIPMENT_CHOICES[number])) throw new Error('Choose the equipment you use for it.');
  if (!TRACKING_TYPES.includes(exercise.trackingType)) throw new Error('Choose how this exercise is measured.');
  if (!Number.isInteger(exercise.defaultRestSeconds) || exercise.defaultRestSeconds < 0 || exercise.defaultRestSeconds > 3600) {
    throw new Error('Rest runs from 0 seconds to an hour.');
  }
  if ((exercise.notes ?? '').length > 280) throw new Error('Keep the description under 280 characters.');
}

/** The shape the picker, the routine builder and a session all already understand. */
export function toCatalogExercise(exercise: CustomExercise, owner: string): CatalogExercise {
  return {
    id: exercise.id, name: exercise.name, primaryMuscle: exercise.primaryMuscle,
    movementPattern: exercise.movementPattern, equipment: exercise.equipment,
    trackingType: exercise.trackingType, ownerUserId: owner,
    description: exercise.notes?.trim() || 'Your own exercise. Sets, rest and volume work exactly as they do for the rest of the catalogue.',
  };
}

/** The reverse of `toCatalogExercise`, for reopening one in the editor. */
export function fromCatalogExercise(exercise: CatalogExercise, defaultRestSeconds = 120): CustomExercise {
  return {
    id: exercise.id, name: exercise.name, primaryMuscle: exercise.primaryMuscle,
    movementPattern: exercise.movementPattern ?? 'horizontal_push', equipment: exercise.equipment ?? 'machine',
    trackingType: exercise.trackingType ?? 'weight_reps', defaultRestSeconds,
    notes: exercise.description,
  };
}

export async function saveCustomExercise(owner: string, exercise: CustomExercise) {
  validateCustomExercise(exercise);
  const { error } = await getSupabase().from('exercises').upsert({
    id: exercise.id, owner_user_id: owner, name: exercise.name.trim(),
    movement_pattern: exercise.movementPattern, equipment: exercise.equipment,
    primary_muscle: exercise.primaryMuscle, tracking_type: exercise.trackingType,
    default_rest_seconds: exercise.defaultRestSeconds, variation_notes: exercise.notes?.trim() || null,
  }, { onConflict: 'id' });
  if (error) throw Object.assign(new Error('This exercise could not be saved to your account.'), { code: error.code });
}

export async function loadCustomExercises(owner: string): Promise<CustomExercise[]> {
  const { data, error } = await getSupabase().from('exercises')
    .select('id,name,movement_pattern,equipment,primary_muscle,tracking_type,default_rest_seconds,variation_notes')
    .eq('owner_user_id', owner).eq('is_archived', false).order('name');
  if (error) throw new Error('Your own exercises are unavailable right now.');
  return (data ?? []).map(row => ({
    id: row.id, name: row.name, movementPattern: row.movement_pattern, equipment: row.equipment,
    primaryMuscle: row.primary_muscle, trackingType: (row.tracking_type ?? 'weight_reps') as TrackingType,
    defaultRestSeconds: row.default_rest_seconds ?? 120, notes: row.variation_notes ?? undefined,
  }));
}

/**
 * Hides an exercise without deleting it. Sets point at exercises, so a delete would either be
 * refused by the foreign key or take real history down with it.
 */
export async function archiveCustomExercise(owner: string, id: string) {
  const { error } = await getSupabase().from('exercises')
    .update({ is_archived: true }).eq('id', id).eq('owner_user_id', owner);
  if (error) throw new Error('This exercise could not be archived.');
}
