import type { SetKind, TrackingType, WorkoutSet } from '../../types/workout';

/**
 * What a set of a given exercise is actually made of. Every set used to be weight times reps,
 * which meant a plank had to be logged as a lie and a farmer carry could not be logged at all.
 *
 * `required` fields must be present before a set can be completed; `optional` ones may be left
 * empty and still count — added weight on a pull-up, the load in a weighted plank.
 */
export type FieldNeed = 'required' | 'optional' | 'none';
export interface SetShape {
  weight: FieldNeed; reps: FieldNeed; duration: FieldNeed; distance: FieldNeed;
  /** Whether weight × reps is a meaningful number for this exercise. */
  countsVolume: boolean;
  label: string;
}

export const TRACKING_TYPES: TrackingType[] = ['weight_reps', 'bodyweight_reps', 'duration', 'distance_duration'];
export const SET_SHAPES: Record<TrackingType, SetShape> = {
  weight_reps: { weight: 'required', reps: 'required', duration: 'none', distance: 'none', countsVolume: true, label: 'Weight & reps' },
  // Body mass is not external load and the schema is explicit that volume excludes it, so only
  // the weight you *added* counts here — a belt-and-chain pull-up, a dip with a dumbbell.
  bodyweight_reps: { weight: 'optional', reps: 'required', duration: 'none', distance: 'none', countsVolume: true, label: 'Bodyweight reps' },
  duration: { weight: 'optional', reps: 'none', duration: 'required', distance: 'none', countsVolume: false, label: 'Duration' },
  distance_duration: { weight: 'optional', reps: 'none', duration: 'optional', distance: 'required', countsVolume: false, label: 'Distance & duration' },
};
export const trackingTypeOf = (exercise: { trackingType?: TrackingType } | undefined): TrackingType =>
  exercise?.trackingType ?? 'weight_reps';
export const shapeOf = (exercise: { trackingType?: TrackingType } | undefined): SetShape =>
  SET_SHAPES[trackingTypeOf(exercise)];

export const SET_KINDS: SetKind[] = ['normal', 'warmup', 'drop', 'failure'];
export const SET_KIND_LABELS: Record<SetKind, string> = {
  normal: 'Working', warmup: 'Warm-up', drop: 'Drop', failure: 'To failure',
};
/** The single character that stands in for the set number in a log. */
export const SET_KIND_MARKS: Record<SetKind, string> = { normal: '', warmup: 'W', drop: 'D', failure: 'F' };

/**
 * Only a warm-up is excluded. A drop set and a set taken to failure are work that happened and
 * has to be recovered from; counting them as anything else would understate a hard session.
 */
export const isHardSet = (set: { kind: SetKind }) => set.kind !== 'warmup';

/**
 * Reading a set stored before sets had a kind, a duration or a distance. Local snapshots and
 * archived sessions outlive an app update, so this runs wherever persisted sets are read back.
 */
export function normalizeSet(raw: WorkoutSet & { isWarmup?: boolean }): WorkoutSet {
  const { isWarmup, ...rest } = raw;
  return {
    ...rest,
    kind: rest.kind ?? (isWarmup ? 'warmup' : 'normal'),
    durationSeconds: rest.durationSeconds ?? null,
    distanceMeters: rest.distanceMeters ?? null,
  };
}

/** Volume in lbs moved. Time under tension and distance are real work but not this number. */
export function setVolumeLbs(set: WorkoutSet, trackingType: TrackingType): number {
  if (!SET_SHAPES[trackingType].countsVolume) return 0;
  if (!isHardSet(set) || set.completedAtMs === null) return 0;
  return (set.weightLbs ?? 0) * (set.reps ?? 0);
}

/**
 * An estimated one-rep max only means something for a rep-based set carrying external load.
 * A plank has no 1RM, and a bodyweight pull-up's would be an estimate of your own mass.
 */
export const supportsOneRepMax = (trackingType: TrackingType) => SET_SHAPES[trackingType].countsVolume;

/**
 * The "previous" column, which is one narrow cell. Reads the way a lifter would say it: weight
 * by reps, plus-weight by reps for a loaded pull-up, a clock for a hold, metres for a carry.
 */
export function describePrevious(set: {
  weightLbs: number | null; reps: number | null; durationSeconds: number | null; distanceMeters: number | null;
}, trackingType: TrackingType): string {
  if (trackingType === 'duration') return set.durationSeconds === null ? '—' : formatDuration(set.durationSeconds);
  if (trackingType === 'distance_duration') {
    if (set.distanceMeters === null) return '—';
    return set.durationSeconds === null ? `${set.distanceMeters} m` : `${set.distanceMeters} m · ${formatDuration(set.durationSeconds)}`;
  }
  if (set.reps === null) return '—';
  if (trackingType === 'bodyweight_reps') return set.weightLbs ? `+${set.weightLbs} × ${set.reps}` : `${set.reps} reps`;
  return set.weightLbs === null ? `${set.reps} reps` : `${set.weightLbs} × ${set.reps}`;
}

export const formatDuration = (seconds: number) => seconds >= 60
  ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
  : `${Math.round(seconds)}s`;

/** What stops a set being marked done. Returns the reason, or null when it is loggable. */
export function missingFor(set: Pick<WorkoutSet, 'weightLbs' | 'reps' | 'durationSeconds' | 'distanceMeters'>, trackingType: TrackingType): string | null {
  const shape = SET_SHAPES[trackingType];
  if (shape.weight === 'required' && set.weightLbs === null) return 'Enter the weight.';
  if (shape.reps === 'required' && set.reps === null) return 'Enter the reps.';
  if (shape.duration === 'required' && set.durationSeconds === null) return 'Enter how long you held it.';
  if (shape.distance === 'required' && set.distanceMeters === null) return 'Enter the distance.';
  return null;
}

/** Bounds mirroring the database checks, so a set the app accepts is one the schema will take. */
export function outOfRange(set: Pick<WorkoutSet, 'weightLbs' | 'reps' | 'rpe' | 'durationSeconds' | 'distanceMeters'>): string | null {
  const { weightLbs, reps, rpe, durationSeconds, distanceMeters } = set;
  if (weightLbs !== null && (!Number.isFinite(weightLbs) || weightLbs < 0)) return 'Use a weight of 0 lbs or more.';
  if (reps !== null && (!Number.isInteger(reps) || reps < 1 || reps > 1000)) return 'Use whole reps from 1 to 1000.';
  if (rpe !== null && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) return 'RPE runs from 1 to 10.';
  if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 86_400)) return 'Use a duration from 1 second to 24 hours.';
  if (distanceMeters !== null && (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || distanceMeters > 1_000_000)) return 'Use a distance from 1 m to 1000 km.';
  return null;
}
