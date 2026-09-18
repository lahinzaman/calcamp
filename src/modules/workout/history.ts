import { isHardSet, setVolumeLbs, supportsOneRepMax, trackingTypeOf } from './setShape';
import type { CompletedWorkout, WorkoutSet } from '../../types/workout';
/**
 * One set as history remembers it. Every field is nullable because a plank has no reps and a
 * carry has no weight; the exercise's tracking type decides which of them mean anything.
 */
export interface RecordedSet {
  weightLbs: number | null; reps: number | null;
  durationSeconds: number | null; distanceMeters: number | null;
}
export interface LiftRecord {
  exerciseId: string;
  /** Working sets from the most recent session, in order, for the "previous" column. */
  lastSets: RecordedSet[];
  lastPerformedMs: number;
  bestOneRepMaxLbs: number;
  bestWeightLbs: number;
  bestSessionVolumeLbs: number;
  sessions: number;
}
export type LiftHistory = Record<string, LiftRecord>;
/**
 * `sessionId` is absent on points recorded before a session could be edited. An edit replaces
 * the point it can identify and leaves the anonymous ones alone, rather than guessing which
 * day's total belonged to the session that changed.
 */
export interface SessionVolumePoint { date: string; value: number; sessionId?: string }
/**
 * The sets a lift's history is built from: completed, not a warm-up, and carrying external load
 * across reps. A plank or a carry is real work, but it has no weight × reps to compare, so it
 * is left out of bests and volume rather than counted as zero.
 */
const exerciseOf = (workout: CompletedWorkout, set: WorkoutSet) =>
  workout.exercises.find(entry => entry.id === set.sessionExerciseId);
/** Everything that counted as work, whatever it was measured in. Warm-ups are not work. */
const hardSets = (workout: CompletedWorkout) => workout.sets.filter(set => set.completedAtMs !== null && isHardSet(set));
/**
 * The subset that bests can be computed from: external load across reps. A plank is real work
 * and belongs in `lastSets`, but it has no weight to be a record and no 1RM to estimate, so it
 * is left out of those rather than counted as zero.
 */
const working = (workout: CompletedWorkout) => hardSets(workout).filter(set =>
  set.weightLbs !== null && set.reps !== null
  && supportsOneRepMax(trackingTypeOf(exerciseOf(workout, set)?.exercise)));
const recorded = (set: WorkoutSet): RecordedSet => ({
  weightLbs: set.weightLbs, reps: set.reps, durationSeconds: set.durationSeconds, distanceMeters: set.distanceMeters,
});
export function dateKeyOf(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export interface PersonalRecord { exerciseId: string; kind: 'weight' | 'oneRepMax'; value: number; previous: number }
/** PRs are decided against history as it stood before this session, so a repeat is not a new record. */
export function detectRecords(history: LiftHistory, workout: CompletedWorkout): PersonalRecord[] {
  const byExercise = new Map<string, { weight: number; oneRepMax: number }>();
  for (const set of working(workout)) {
    const exercise = workout.exercises.find(entry => entry.id === set.sessionExerciseId);
    if (!exercise) continue;
    const current = byExercise.get(exercise.exercise.id) ?? { weight: 0, oneRepMax: 0 };
    byExercise.set(exercise.exercise.id, {
      weight: Math.max(current.weight, set.weightLbs!),
      oneRepMax: Math.max(current.oneRepMax, set.estimatedOneRepMaxLbs ?? 0),
    });
  }
  const records: PersonalRecord[] = [];
  for (const [exerciseId, best] of byExercise) {
    const previous = history[exerciseId];
    if (best.weight > (previous?.bestWeightLbs ?? 0)) records.push({ exerciseId, kind: 'weight', value: best.weight, previous: previous?.bestWeightLbs ?? 0 });
    if (best.oneRepMax > (previous?.bestOneRepMaxLbs ?? 0)) records.push({ exerciseId, kind: 'oneRepMax', value: best.oneRepMax, previous: previous?.bestOneRepMaxLbs ?? 0 });
  }
  return records;
}
export function recordWorkout(history: LiftHistory, workout: CompletedWorkout): LiftHistory {
  const next: LiftHistory = { ...history };
  for (const exercise of workout.exercises) {
    // Everything you did shows up as "last time", including the sets that have no weight.
    const all = hardSets(workout).filter(set => set.sessionExerciseId === exercise.id);
    if (!all.length) continue;
    const loaded = working(workout).filter(set => set.sessionExerciseId === exercise.id);
    const id = exercise.exercise.id;
    const previous = next[id];
    const volume = loaded.reduce((sum, set) => sum + set.weightLbs! * set.reps!, 0);
    next[id] = {
      exerciseId: id,
      lastSets: all.map(recorded),
      lastPerformedMs: workout.endedAtMs,
      // Bests stay where they were when a session had nothing loaded to compare against.
      bestOneRepMaxLbs: Math.max(previous?.bestOneRepMaxLbs ?? 0, ...loaded.map(set => set.estimatedOneRepMaxLbs ?? 0)),
      bestWeightLbs: Math.max(previous?.bestWeightLbs ?? 0, ...loaded.map(set => set.weightLbs!)),
      bestSessionVolumeLbs: Math.max(previous?.bestSessionVolumeLbs ?? 0, volume),
      sessions: (previous?.sessions ?? 0) + 1,
    };
  }
  return next;
}
/** Next-session suggestion: add reps inside the range first, then weight once the top is held. */
export function overloadSuggestion(record: LiftRecord | undefined, repRange: [number, number] = [6, 12]) {
  // Only a loaded, rep-based set has a next weight to suggest. Adding 5 lbs to a plank is not
  // advice, so an exercise measured any other way gets none rather than a nonsense number.
  const loaded = (record?.lastSets ?? []).filter((set): set is RecordedSet & { weightLbs: number; reps: number } =>
    set.weightLbs !== null && set.reps !== null);
  if (!loaded.length) return null;
  const top = loaded.reduce((best, set) => set.weightLbs > best.weightLbs || (set.weightLbs === best.weightLbs && set.reps > best.reps) ? set : best);
  if (top.reps >= repRange[1]) {
    const step = top.weightLbs >= 200 ? 10 : top.weightLbs >= 80 ? 5 : 2.5;
    return { weightLbs: top.weightLbs + step, reps: repRange[0], reason: `You held ${top.reps} reps at ${top.weightLbs} lbs — add weight and reset the reps.` };
  }
  return { weightLbs: top.weightLbs, reps: top.reps + 1, reason: `Last time you managed ${top.reps} reps at ${top.weightLbs} lbs — try one more.` };
}
export function sessionVolume(workout: CompletedWorkout) {
  return workout.sets.reduce((sum, set) =>
    sum + setVolumeLbs(set, trackingTypeOf(exerciseOf(workout, set)?.exercise)), 0);
}
