import { exerciseById } from './catalog';
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
export const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest', upper_back: 'Upper back', lats: 'Lats', shoulders: 'Shoulders', rear_delts: 'Rear delts',
  biceps: 'Biceps', triceps: 'Triceps', quadriceps: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes',
  calves: 'Calves', abdominals: 'Abs',
};
export interface RoutineExercise { exerciseId: string; sets: number; restSeconds: number; repLow: number; repHigh: number }
export interface ScheduledRoutine { exercises: RoutineExercise[]; timesPerWeek: number }
export interface MuscleVolume {
  muscle: string; label: string; sets: number; frequency: number;
  status: 'none' | 'under' | 'in-range' | 'over';
  frequencyOk: boolean;
}
/**
 * Weekly hard sets and how many separate sessions hit each muscle.
 * Only the primary mover is counted — crediting every assisting muscle inflates
 * the total and is what makes most volume calculators useless.
 */
export function weeklyVolume(schedule: readonly ScheduledRoutine[], experience: ExperienceLevel): MuscleVolume[] {
  const [low, high] = WEEKLY_SET_TARGETS[experience];
  const sets = new Map<string, number>();
  const sessions = new Map<string, number>();
  for (const routine of schedule) {
    if (!Number.isFinite(routine.timesPerWeek) || routine.timesPerWeek <= 0) continue;
    const hit = new Set<string>();
    for (const entry of routine.exercises) {
      const muscle = exerciseById(entry.exerciseId)?.primaryMuscle;
      if (!muscle || !Number.isFinite(entry.sets) || entry.sets <= 0) continue;
      sets.set(muscle, (sets.get(muscle) ?? 0) + entry.sets * routine.timesPerWeek);
      hit.add(muscle);
    }
    for (const muscle of hit) sessions.set(muscle, (sessions.get(muscle) ?? 0) + routine.timesPerWeek);
  }
  return [...new Set([...Object.keys(MUSCLE_LABELS), ...sets.keys()])].map((muscle): MuscleVolume => {
    const total = sets.get(muscle) ?? 0;
    const frequency = sessions.get(muscle) ?? 0;
    return {
      muscle, label: MUSCLE_LABELS[muscle] ?? muscle, sets: total, frequency,
      status: total === 0 ? 'none' : total < low ? 'under' : total > high ? 'over' : 'in-range',
      frequencyOk: total === 0 || frequency >= TARGET_FREQUENCY,
    };
  }).sort((a, b) => b.sets - a.sets || a.label.localeCompare(b.label));
}
export interface VolumeAdvice { tone: 'good' | 'warn'; text: string }
/** Plain-language coaching on a plan, in priority order: frequency first, then volume. */
export function volumeAdvice(volume: readonly MuscleVolume[], experience: ExperienceLevel): VolumeAdvice[] {
  const [low, high] = WEEKLY_SET_TARGETS[experience];
  const trained = volume.filter(entry => entry.sets > 0);
  if (!trained.length) return [{ tone: 'warn', text: 'Nothing is scheduled yet. Add exercises to a routine and set how often you run it.' }];
  const advice: VolumeAdvice[] = [];
  const onceAWeek = trained.filter(entry => !entry.frequencyOk);
  if (onceAWeek.length) advice.push({ tone: 'warn', text: `${onceAWeek.map(entry => entry.label).join(', ')} only get trained once a week. Splitting those sets across two sessions grows more muscle for the same total work.` });
  const under = trained.filter(entry => entry.status === 'under');
  if (under.length) advice.push({ tone: 'warn', text: `${under.map(entry => `${entry.label} (${entry.sets})`).join(', ')} fall short of ${low} sets a week. Add a set or two where you recover best.` });
  const over = trained.filter(entry => entry.status === 'over');
  if (over.length) advice.push({ tone: 'warn', text: `${over.map(entry => `${entry.label} (${entry.sets})`).join(', ')} exceed ${high} sets a week. More is not better once recovery is the limit — cut the least productive sets.` });
  const missing = volume.filter(entry => entry.sets === 0);
  if (missing.length) advice.push({ tone: 'warn', text: `Nothing trains ${missing.map(entry => entry.label).join(', ')}. That is fine if it is deliberate.` });
  if (!advice.length) advice.push({ tone: 'good', text: `Every muscle sits inside ${low}–${high} sets a week and gets trained at least twice. This is a plan worth repeating — progress it by adding reps or weight, not more sets.` });
  return advice;
}
