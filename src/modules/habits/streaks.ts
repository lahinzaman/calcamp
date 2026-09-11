import type { HistoryDay } from '../../api/history';
export interface StreakSummary { current: number; longest: number; loggedDays: number; lastLoggedDate: string | null }
const MS_PER_DAY = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY;
/** A day counts as logged once it has any calories recorded; adherence is a separate, stricter idea. */
export const isLogged = (day: Pick<HistoryDay, 'calories_kcal'>) => day.calories_kcal !== null && day.calories_kcal > 0;
export function summarizeStreak(days: readonly Pick<HistoryDay, 'log_date' | 'calories_kcal'>[], today: string): StreakSummary {
  const logged = days.filter(isLogged).map(day => dayNumber(day.log_date)).filter(Number.isFinite).sort((a, b) => a - b);
  const unique = [...new Set(logged)];
  if (!unique.length) return { current: 0, longest: 0, loggedDays: 0, lastLoggedDate: null };
  let longest = 1; let run = 1;
  for (let i = 1; i < unique.length; i++) {
    run = unique[i] - unique[i - 1] === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  // Today not yet logged does not break the streak; yesterday is still the anchor until midnight.
  const now = dayNumber(today); const last = unique[unique.length - 1];
  let current = 0;
  if (last === now || last === now - 1) {
    current = 1;
    for (let i = unique.length - 1; i > 0; i--) {
      if (unique[i] - unique[i - 1] !== 1) break;
      current++;
    }
  }
  return { current, longest, loggedDays: unique.length, lastLoggedDate: days.filter(isLogged).sort((a, b) => a.log_date < b.log_date ? 1 : -1)[0]?.log_date ?? null };
}
export interface Milestone { id: string; label: string; description: string; reached: boolean; progress: number }
export function milestones(streak: StreakSummary, workoutSessions: number): Milestone[] {
  const define = (id: string, label: string, description: string, value: number, goal: number): Milestone =>
    ({ id, label, description, reached: value >= goal, progress: Math.min(1, goal ? value / goal : 0) });
  return [
    define('first-log', 'First log', 'Log your first day of food.', streak.loggedDays, 1),
    define('week-streak', '7-day streak', 'Log food seven days running.', streak.current, 7),
    define('month-streak', '30-day streak', 'A full month without missing a day.', streak.current, 30),
    define('fifty-days', '50 days logged', 'Fifty days recorded in total.', streak.loggedDays, 50),
    define('ten-workouts', '10 workouts', 'Finish ten training sessions.', workoutSessions, 10),
    define('fifty-workouts', '50 workouts', 'Fifty sessions in the log.', workoutSessions, 50),
  ];
}
/** Hitting calories and protein is the pair worth celebrating; carbs and fat follow from them. */
export function hitTargets(consumed: { caloriesKcal: number; proteinG: number }, target: { caloriesKcal: number; proteinG: number } | undefined) {
  if (!target?.caloriesKcal || !target.proteinG) return false;
  const calories = consumed.caloriesKcal >= target.caloriesKcal * .95 && consumed.caloriesKcal <= target.caloriesKcal * 1.05;
  return calories && consumed.proteinG >= target.proteinG * .95;
}
