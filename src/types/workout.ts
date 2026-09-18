/**
 * How a set of this exercise is measured. Not every lift is weight times reps: a plank is
 * seconds, a farmer carry is metres and seconds, a pull-up is reps with whatever you are
 * carrying added. Absent means `weight_reps`, which is what every exercise was before this.
 */
export type TrackingType = 'weight_reps' | 'bodyweight_reps' | 'duration' | 'distance_duration';

/**
 * What kind of set this was. A warm-up is logged but never counted as hard volume; a drop set
 * and a set taken to failure are both working sets and do count, but they are worth marking so
 * a heavy top set and the drop after it are not read as the same effort next week.
 */
export type SetKind = 'normal' | 'warmup' | 'drop' | 'failure';

/** Each mechanical variant is a distinct catalog ID, even when names are similar. */
export interface ExerciseDefinition {
  id: string;
  name: string;
  movementPattern?: string;
  equipment?: string;
  grip?: string;
  gripWidth?: string;
  bodyPosition?: string;
  laterality?: 'bilateral' | 'unilateral' | 'alternating';
  variationNotes?: string;
  trackingType?: TrackingType;
  /** Set on exercises the user created. Absent on the shared catalogue. */
  ownerUserId?: string;
}

export interface WorkoutSession {
  id: string;
  name: string;
  startedAtMs: number;
}

/** Instance IDs permit the same catalog exercise more than once in a session. */
export interface SessionExercise {
  id: string;
  exercise: ExerciseDefinition;
  defaultRestSeconds: number;
  /**
   * What you want to remember for next time: the pin setting, the bench number, which cue
   * worked. Belongs to the instance, not the catalogue entry, so the same lift can carry a
   * different note in a different session.
   */
  note?: string;
  /**
   * Exercises sharing a superset ID are done back to back, and only the last of them starts a
   * rest timer. Absent means the exercise stands on its own, which is nearly all of them.
   */
  supersetId?: string;
}

export interface WorkoutSet {
  id: string;
  sessionExerciseId: string;
  weightLbs: number | null;
  reps: number | null;
  rpe: number | null;
  /** Seconds held or worked, for a plank or a carry. */
  durationSeconds: number | null;
  /** Metres covered, for a carry or a run. */
  distanceMeters: number | null;
  kind: SetKind;
  restSeconds: number;
  /** Supplied by the lifting module using Brzycki; the store does not infer it. */
  estimatedOneRepMaxLbs: number | null;
  completedAtMs: number | null;
}

export interface RestTimer {
  startedAtMs: number;
  endsAtMs: number;
  durationSeconds: number;
  sourceSetId: string | null;
}

export interface CompletedWorkout {
  session: WorkoutSession;
  endedAtMs: number;
  exercises: SessionExercise[];
  sets: WorkoutSet[];
  /**
   * Set when the session has been edited after it finished. The first upload of a workout is
   * write-once so a retried send cannot duplicate it; an edit has to say so explicitly to get
   * past that guard, and its value makes each revision its own idempotent queue entry.
   */
  editedAtMs?: number;
}
