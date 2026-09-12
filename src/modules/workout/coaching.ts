import { TARGET_FREQUENCY, WEEKLY_SET_TARGETS, type ExperienceLevel, type MuscleVolume } from './volume';
export interface CoachingContext {
  experience: ExperienceLevel;
  volume: readonly MuscleVolume[];
  /** Sessions logged in the last 7 days. */
  sessionsThisWeek: number;
  /** Sessions where no lift beat the previous session's weight or reps. */
  stalledSessions: number;
  /** Average RPE across completed working sets, when recorded. */
  averageRpe: number | null;
  /** Grams of protein per lb of body weight over the last week, when both are known. */
  proteinPerLb: number | null;
  /** Intended weekly weight change in lbs; negative while cutting. */
  intendedWeeklyChangeLbs: number;
  /** Days since the last body-weight entry. */
  daysSinceWeighIn: number | null;
  shortestRestSeconds: number | null;
}
export interface Tip { id: string; title: string; body: string; priority: number }
/**
 * Contextual coaching, ordered by how much it matters right now. These are CalCamp's
 * own guidance drawn from mainstream evidence-based practice — they are not quotations
 * from, or endorsements by, any individual coach.
 */
export function coachingTips(context: CoachingContext): Tip[] {
  const [low, high] = WEEKLY_SET_TARGETS[context.experience];
  const tips: Tip[] = [];
  const trained = context.volume.filter(entry => entry.sets > 0);

  const rare = trained.filter(entry => !entry.frequencyOk);
  if (rare.length) tips.push({ id: 'frequency', priority: 1, title: 'Split these across two days',
    body: `${rare.map(entry => entry.label).join(', ')} only get hit once a week. The same weekly sets, spread over ${TARGET_FREQUENCY} sessions, gives you two quality efforts instead of one long, fatiguing one.` });

  const over = trained.filter(entry => entry.status === 'over');
  if (over.length) tips.push({ id: 'over', priority: 2, title: 'More sets are not buying more muscle',
    body: `${over.map(entry => entry.label).join(', ')} are past ${high} sets a week. Past the point you can recover, extra sets add fatigue and nothing else. Cut the sets you care least about and push harder on the rest.` });

  const under = trained.filter(entry => entry.status === 'under');
  if (under.length) tips.push({ id: 'under', priority: 3, title: 'A little more work here',
    body: `${under.map(entry => entry.label).join(', ')} sit below ${low} sets a week. One or two added sets is usually the cheapest progress available.` });

  if (context.stalledSessions >= 3) tips.push({ id: 'stall', priority: 2, title: `${context.stalledSessions} sessions without adding weight or reps`,
    body: 'Progression is the point — the sets are only the delivery mechanism. Pick one lift and commit to one more rep than last time, or the smallest weight increase the rack allows.' });

  if (context.averageRpe !== null && context.averageRpe >= 9.5) tips.push({ id: 'rpe-high', priority: 2, title: 'Almost every set is to failure',
    body: 'Training to failure on everything costs more recovery than it returns. Leaving one or two reps in reserve on most sets lets you do more total quality work across the week.' });
  if (context.averageRpe !== null && context.averageRpe <= 6.5) tips.push({ id: 'rpe-low', priority: 3, title: 'There is room to push',
    body: 'Your average set is finishing well short of hard. Muscle responds to sets taken close to failure — aim to end most sets with one to three reps left.' });

  if (context.shortestRestSeconds !== null && context.shortestRestSeconds < 60) tips.push({ id: 'rest', priority: 4, title: 'Rest a little longer on the big lifts',
    body: 'Short rests cap the weight you can use on the next set. Two to three minutes on compounds keeps the quality up; 60–90 seconds is fine for isolation work.' });

  if (context.proteinPerLb !== null && context.proteinPerLb < 0.7) tips.push({ id: 'protein', priority: context.intendedWeeklyChangeLbs < 0 ? 1 : 3,
    title: 'Protein is the one macro worth chasing',
    body: `You are averaging ${context.proteinPerLb.toFixed(2)} g per lb of body weight. Around 0.7–1.0 g per lb protects muscle${context.intendedWeeklyChangeLbs < 0 ? ' — and that matters most in a deficit, where the weight you lose should be fat' : ''}.` });

  if (context.daysSinceWeighIn !== null && context.daysSinceWeighIn >= 7) tips.push({ id: 'weigh-in', priority: 2, title: 'No weigh-in for a week',
    body: 'Your calorie target adjusts from the weight trend. Without readings it cannot tell a stall from a plateau, and it will keep recommending a budget that may no longer fit.' });

  if (context.sessionsThisWeek === 0) tips.push({ id: 'consistency', priority: 5, title: 'A short session beats a skipped one',
    body: 'Nothing logged this week yet. Two exercises done properly still counts, and keeps the habit that makes the rest work.' });

  return tips.sort((a, b) => a.priority - b.priority);
}
