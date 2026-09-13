/** "Perfectly hit" means landing inside this band either side of the calorie target. */
export const PERFECT_WINDOW_KCAL = 100;

export type DayMark = 'perfect' | 'under' | 'over' | 'logged' | 'none';
export interface DayStatus { mark: DayMark; label: string; glyph: string }

const pad = (value: number) => String(value).padStart(2, '0');
export const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) throw new RangeError('Use a valid YYYY-MM-DD date.');
  parsed.setDate(parsed.getDate() + days);
  return dateKey(parsed);
}
/** The Monday-first week containing `date`, shifted by whole weeks. */
export function weekDates(date: string, weekOffset = 0): string[] {
  const parsed = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) throw new RangeError('Use a valid YYYY-MM-DD date.');
  const monday = addDays(dateKey(parsed), -((parsed.getDay() + 6) % 7) + weekOffset * 7);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/**
 * A day with no target cannot be judged against one, and a day with no log is not a miss —
 * both stay neutral rather than being coloured as failures.
 */
export type DayLabeller = (key: 'day.nothingLogged' | 'day.logged' | 'day.onTarget' | 'day.under' | 'day.over',
  params?: Record<string, string | number>) => string;
const plain: DayLabeller = (key, params) => {
  const kcal = params?.kcal;
  switch (key) {
    case 'day.nothingLogged': return 'Nothing logged';
    case 'day.logged': return `${kcal} kcal logged`;
    case 'day.onTarget': return `On target · ${kcal} kcal`;
    case 'day.under': return `${kcal} kcal under target`;
    case 'day.over': return `${kcal} kcal over target`;
  }
};
export function dayStatus(calories: number | null | undefined, target: number | null, label: DayLabeller = plain): DayStatus {
  if (calories == null || calories <= 0) return { mark: 'none', label: label('day.nothingLogged'), glyph: '·' };
  if (target === null) return { mark: 'logged', label: label('day.logged', { kcal: Math.round(calories) }), glyph: '●' };
  const delta = calories - target;
  if (Math.abs(delta) <= PERFECT_WINDOW_KCAL) return { mark: 'perfect', label: label('day.onTarget', { kcal: Math.round(calories) }), glyph: '✓' };
  if (delta < 0) return { mark: 'under', label: label('day.under', { kcal: Math.round(-delta) }), glyph: '▾' };
  return { mark: 'over', label: label('day.over', { kcal: Math.round(delta) }), glyph: '▴' };
}

export const timeOfDay = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
export const shortWeekday = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' });
export const dayOfMonth = (date: string) => Number(date.slice(8, 10));

/** How many of the days you logged landed inside the window. */
export function perfectDays(days: readonly { log_date: string; calories_kcal: number | null }[], target: number | null) {
  const logged = days.filter(day => day.calories_kcal != null && day.calories_kcal > 0);
  const hit = logged.filter(day => dayStatus(day.calories_kcal, target).mark === 'perfect').length;
  return { hit, logged: logged.length };
}
