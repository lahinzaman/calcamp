import { exerciseById } from './catalog';
import { PARTIAL_SET_CREDIT, secondaryMuscles } from './synergists';
export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type ExperienceLevel = typeof EXPERIENCE_LEVELS[number];
/** Hard sets per muscle per week. Advanced lifters get a wide band to choose within. */
export const WEEKLY_SET_TARGETS: Record<ExperienceLevel, [number, number]> = {
  beginner: [10, 12], intermediate: [8, 10], advanced: [4, 12],
};
export const EXPERIENCE_NOTES: Record<ExperienceLevel, string> = {
  beginner: 'New to lifting, or back after a long break. 10–12 hard sets per muscle each week is plenty to grow on, and leaves room to recover.',
  intermediate: 'Training consistently for a year or more. 8–10 quality sets per muscle beats padding the total with junk volume.',
  advanced: 'Years of training and a good sense of your own recovery. Anywhere from 4 to 12 sets works — pick what you can actually recover from and progress on.',
};
/** Each muscle twice a week, whatever split gets you there. */
export const TARGET_FREQUENCY = 2;
/**
 * The muscles a balanced week is expected to cover. Everything outside this list is
 * accessory work: it is counted and shown once it is trained, but never nagged about.
 */
export const CORE_MUSCLES = ['chest', 'upper_back', 'lats', 'shoulders', 'rear_delts', 'biceps', 'triceps',
  'quadriceps', 'hamstrings', 'glutes', 'calves', 'abdominals'] as const;
export const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest', upper_back: 'Upper back', lats: 'Lats', shoulders: 'Shoulders', rear_delts: 'Rear delts',
  biceps: 'Biceps', triceps: 'Triceps', quadriceps: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes',
  calves: 'Calves', abdominals: 'Abs', traps: 'Traps', forearms: 'Forearms', obliques: 'Obliques',
  adductors: 'Adductors', abductors: 'Abductors', lower_back: 'Lower back',
};
export interface RoutineExercise {
  exerciseId: string; sets: number; restSeconds: number; repLow: number; repHigh: number;
  /**
   * Exercises sharing this are supersetted: done back to back, with the rest after the round.
   * Stored on the routine so a pairing is built once and applied to every session that runs it.
   * Absent on routines saved before supersets existed, and on the exercises you do on their own.
   */
  supersetId?: string;
  /**
   * A standing note about this lift — the seat height, the bench number, the cue that works.
   * It seeds each session's own note, which then belongs to that session: editing it mid-workout
   * records what happened that day and leaves the standing note alone.
   */
  note?: string;
}
export interface ScheduledRoutine { exercises: RoutineExercise[]; timesPerWeek: number }
export interface MuscleVolume {
  muscle: string; label: string;
  /** Hard sets where this muscle was the target. Unchanged in meaning from before. */
  sets: number;
  /** Sets where it assisted another target: triceps in a bench press, biceps in a row. */
  partialSets: number;
  /** Direct sets plus partial sets at PARTIAL_SET_CREDIT — an estimate of total stimulus,
   *  shown for information. The range is not judged on it; see weeklyVolume. */
  effectiveSets: number;
  frequency: number;
  status: 'none' | 'under' | 'in-range' | 'over';
  frequencyOk: boolean;
}
/**
 * Weekly hard sets and how many separate sessions hit each muscle.
 *
 * Assisting work is counted and reported, but the in-range verdict is still judged on direct
 * sets alone. The set targets were calibrated against direct work; measuring effective sets
 * against them is a units mismatch, and it flagged a textbook plan — ten direct sets a muscle —
 * as overtraining eight muscles, because every row and pulldown also credits the biceps.
 *
 * What assisting work does change is the claim that a muscle goes untrained. A program full of
 * pressing used to report the triceps as untouched; they are not, and it no longer says so.
 *
 * Frequency stays direct-only. A session is a session for a muscle when it was the point of it.
 */
export function weeklyVolume(schedule: readonly ScheduledRoutine[], experience: ExperienceLevel): MuscleVolume[] {
  const [low, high] = WEEKLY_SET_TARGETS[experience];
  const sets = new Map<string, number>();
  const partial = new Map<string, number>();
  const sessions = new Map<string, number>();
  for (const routine of schedule) {
    if (!Number.isFinite(routine.timesPerWeek) || routine.timesPerWeek <= 0) continue;
    const hit = new Set<string>();
    for (const entry of routine.exercises) {
      const exercise = exerciseById(entry.exerciseId);
      const muscle = exercise?.primaryMuscle;
      if (!exercise || !muscle || !Number.isFinite(entry.sets) || entry.sets <= 0) continue;
      const weekly = entry.sets * routine.timesPerWeek;
      sets.set(muscle, (sets.get(muscle) ?? 0) + weekly);
      hit.add(muscle);
      for (const assisting of secondaryMuscles(exercise)) partial.set(assisting, (partial.get(assisting) ?? 0) + weekly);
    }
    for (const muscle of hit) sessions.set(muscle, (sessions.get(muscle) ?? 0) + routine.timesPerWeek);
  }
  return [...new Set([...CORE_MUSCLES, ...sets.keys(), ...partial.keys()])].map((muscle): MuscleVolume => {
    const direct = sets.get(muscle) ?? 0;
    const assisted = partial.get(muscle) ?? 0;
    const effective = direct + assisted * PARTIAL_SET_CREDIT;
    const frequency = sessions.get(muscle) ?? 0;
    return {
      muscle, label: MUSCLE_LABELS[muscle] ?? muscle, sets: direct, partialSets: assisted, effectiveSets: effective, frequency,
      status: direct === 0 ? 'none' : direct < low ? 'under' : direct > high ? 'over' : 'in-range',
      // Assisted work alone is not a reason to call the frequency short: there is no direct work to space out.
      frequencyOk: direct === 0 || frequency >= TARGET_FREQUENCY,
    };
  }).sort((a, b) => b.effectiveSets - a.effectiveSets || a.label.localeCompare(b.label));
}
export interface VolumeAdvice { tone: 'good' | 'warn'; text: string }
/** Plain-language coaching on a plan, in priority order: frequency first, then volume. */
export function volumeAdvice(volume: readonly MuscleVolume[], experience: ExperienceLevel): VolumeAdvice[] {
  const [low, high] = WEEKLY_SET_TARGETS[experience];
  const trained = volume.filter(entry => entry.sets > 0);
  if (!trained.length) return [{ tone: 'warn', text: 'Nothing is scheduled yet. Add exercises to a routine and set how often you run it.' }];
  // Set targets describe the major muscles. Forearms, traps and the rest are counted and
  // shown, but holding accessory work to the same numbers would just generate noise.
  const judged = trained.filter(entry => (CORE_MUSCLES as readonly string[]).includes(entry.muscle));
  const advice: VolumeAdvice[] = [];
  const onceAWeek = judged.filter(entry => !entry.frequencyOk);
  if (onceAWeek.length) advice.push({ tone: 'warn', text: `${onceAWeek.map(entry => entry.label).join(', ')} only get trained once a week. Splitting those sets across two sessions grows more muscle for the same total work.` });
  const under = judged.filter(entry => entry.status === 'under');
  if (under.length) advice.push({ tone: 'warn', text: `${under.map(entry => `${entry.label} (${entry.sets})`).join(', ')} fall short of ${low} sets a week. Add a set or two where you recover best.` });
  const over = judged.filter(entry => entry.status === 'over');
  if (over.length) advice.push({ tone: 'warn', text: `${over.map(entry => `${entry.label} (${entry.sets})`).join(', ')} exceed ${high} sets a week. More is not better once recovery is the limit — cut the least productive sets.` });
  // A muscle that only assists is still trained, so it is not reported as untrained; it is
  // named separately, because partial work is not a substitute a person should assume.
  const missing = volume.filter(entry => entry.sets === 0 && entry.partialSets === 0 && (CORE_MUSCLES as readonly string[]).includes(entry.muscle));
  if (missing.length) advice.push({ tone: 'warn', text: `Nothing trains ${missing.map(entry => entry.label).join(', ')}. That is fine if it is deliberate.` });
  const assistedOnly = volume.filter(entry => entry.sets === 0 && entry.partialSets > 0 && (CORE_MUSCLES as readonly string[]).includes(entry.muscle));
  if (assistedOnly.length) advice.push({ tone: 'warn', text: `${assistedOnly.map(entry => entry.label).join(', ')} only work partially, assisting other exercises. That builds some muscle, but not what direct sets would — add one if they matter to you.` });
  if (!advice.length) advice.push({ tone: 'good', text: `Every muscle sits inside ${low}–${high} sets a week and gets trained at least twice. This is a plan worth repeating — progress it by adding reps or weight, not more sets.` });
  return advice;
}
