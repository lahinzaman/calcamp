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
}

export interface WorkoutSet {
  id: string;
  sessionExerciseId: string;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  isWarmup: boolean;
  restSeconds: number;
  /** Supplied by the lifting module using Brzycki; the store does not infer it. */
  estimatedOneRepMaxKg: number | null;
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
}
