import type { CompletedWorkout } from '../../types/workout';
export interface LiftRecord {
  exerciseId: string;
  /** Working sets from the most recent session, in order, for the "previous" column. */
  lastSets: { weightLbs: number; reps: number }[];
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
const working = (workout: CompletedWorkout) => workout.sets.filter(set => set.completedAtMs !== null && !set.isWarmup && set.weightLbs !== null && set.reps !== null);
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
    const sets = working(workout).filter(set => set.sessionExerciseId === exercise.id);
    if (!sets.length) continue;
    const id = exercise.exercise.id;
    const previous = next[id];
    const volume = sets.reduce((sum, set) => sum + set.weightLbs! * set.reps!, 0);
    next[id] = {
      exerciseId: id,
      lastSets: sets.map(set => ({ weightLbs: set.weightLbs!, reps: set.reps! })),
      lastPerformedMs: workout.endedAtMs,
      bestOneRepMaxLbs: Math.max(previous?.bestOneRepMaxLbs ?? 0, ...sets.map(set => set.estimatedOneRepMaxLbs ?? 0)),
      bestWeightLbs: Math.max(previous?.bestWeightLbs ?? 0, ...sets.map(set => set.weightLbs!)),
      bestSessionVolumeLbs: Math.max(previous?.bestSessionVolumeLbs ?? 0, volume),
      sessions: (previous?.sessions ?? 0) + 1,
    };
  }
  return next;
}
/** Next-session suggestion: add reps inside the range first, then weight once the top is held. */
export function overloadSuggestion(record: LiftRecord | undefined, repRange: [number, number] = [6, 12]) {
  if (!record?.lastSets.length) return null;
  const top = record.lastSets.reduce((best, set) => set.weightLbs > best.weightLbs || (set.weightLbs === best.weightLbs && set.reps > best.reps) ? set : best);
  if (top.reps >= repRange[1]) {
    const step = top.weightLbs >= 200 ? 10 : top.weightLbs >= 80 ? 5 : 2.5;
    return { weightLbs: top.weightLbs + step, reps: repRange[0], reason: `You held ${top.reps} reps at ${top.weightLbs} lbs — add weight and reset the reps.` };
  }
  return { weightLbs: top.weightLbs, reps: top.reps + 1, reason: `Last time you managed ${top.reps} reps at ${top.weightLbs} lbs — try one more.` };
}
export function sessionVolume(workout: CompletedWorkout) {
  return working(workout).reduce((sum, set) => sum + set.weightLbs! * set.reps!, 0);
}
