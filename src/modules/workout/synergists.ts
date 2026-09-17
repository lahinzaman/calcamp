import type { CatalogExercise } from './catalog';

/**
 * The muscles a movement recruits besides its target. They belong to the movement pattern,
 * not the individual exercise: a horizontal press drives the elbows straight and the upper arm
 * forward whether it is a barbell bench, a push-up or a machine, so triceps and front delts
 * work in all of them.
 *
 * Deliberately conservative. Only muscles that do real, repeated work through the range are
 * listed. Stabilisers that merely brace — the lower back in a squat, the core in almost
 * everything — are left out, because counting them is how a volume total ends up crediting
 * every muscle in the body for every set.
 */
const BY_PATTERN: Record<string, readonly string[]> = {
  horizontal_push: ['triceps', 'shoulders'],
  horizontal_adduction: ['shoulders'],
  vertical_push: ['triceps', 'traps'],
  shoulder_abduction: ['traps'],
  horizontal_abduction: ['upper_back'],
  horizontal_pull: ['biceps', 'rear_delts', 'lats', 'upper_back'],
  vertical_pull: ['biceps', 'upper_back'],
  elbow_flexion: ['forearms'],
  squat: ['glutes', 'adductors'],
  lunge: ['glutes', 'adductors', 'quadriceps'],
  knee_extension: ['quadriceps'],
  hip_hinge: ['glutes', 'lower_back', 'hamstrings'],
  hip_extension: ['hamstrings'],
  knee_flexion: ['calves'],
  spinal_extension: ['glutes', 'hamstrings'],
  trunk_flexion: ['obliques'],
  anti_extension: ['obliques'],
  trunk_rotation: ['abdominals'],
  lateral_flexion: ['abdominals'],
  carry: ['traps', 'forearms', 'obliques'],
};

/** Secondary muscles for one exercise. The target is never listed as working itself partially,
 *  so a pattern shared by two targets — a row led by the lats or by the upper back — names the
 *  other one and not the one already counted in full. */
export function secondaryMuscles(exercise: Pick<CatalogExercise, 'movementPattern' | 'primaryMuscle'>): string[] {
  const listed = BY_PATTERN[exercise.movementPattern ?? ''] ?? [];
  return listed.filter(muscle => muscle !== exercise.primaryMuscle);
}

/**
 * How much of a set counts for a muscle that only assisted it. Half is the convention most
 * evidence-based hypertrophy programming uses for indirect volume: a close-grip bench does real
 * triceps work, but not what the same sets of extensions would. It is one number so it can be
 * argued with in one place.
 */
export const PARTIAL_SET_CREDIT = 0.5;
