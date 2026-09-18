import type { TrackingType } from '../../types/workout';

/**
 * How each catalogue exercise is measured. Everything is weight × reps unless it is named here
 * or lifted with nothing but your own body — that default is what the whole catalogue was
 * before non-weight sets existed, so nothing already logged changes meaning.
 *
 * Kept beside the catalogue rather than inside `catalog.json`, because that file is also the
 * source the shared database catalogue is seeded from and its columns are fixed.
 */
const BY_NAME: Record<string, TrackingType> = {
  // Held, not repeated: a rep count here would be a number nobody could act on.
  'Plank': 'duration',
  'Side Plank': 'duration',
  'Weighted Plank': 'duration',
  'Dead Bug': 'duration',
  'Scapular Pull-Up': 'bodyweight_reps',
  // Loaded, but the work is the ground you cover with it.
  'Farmer Carry': 'distance_duration',
  'Suitcase Carry': 'distance_duration',
  'Banded Lateral Walk': 'distance_duration',
};

/**
 * Bodyweight movements you can still load — a dipping belt, a dumbbell between the feet — so
 * added weight stays optional and counts toward volume, while body mass never does.
 */
export function trackingTypeFor(exercise: { name: string; equipment?: string }): TrackingType {
  return BY_NAME[exercise.name] ?? (exercise.equipment === 'bodyweight' ? 'bodyweight_reps' : 'weight_reps');
}
