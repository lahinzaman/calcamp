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
}

export interface WorkoutSet {
  id: string;
  sessionExerciseId: string;
  weightLbs: number | null;
  reps: number | null;
  rpe: number | null;
  isWarmup: boolean;
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
