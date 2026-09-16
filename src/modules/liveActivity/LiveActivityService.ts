import { Platform } from 'react-native';
import type { MacroTotals } from '../../types/nutrition';

/** The id of the running activity, or null when none is. Held here rather than in a component,
 *  because the activity outlives whatever screen started it. */
let current: string | null = null;

export interface DayProgress {
  consumed: MacroTotals;
  /** Null when the profile has no calorie target: a ring with nothing to fill is not progress. */
  targetKcal: number | null;
}

/**
 * ActivityKit exists on iOS 16.1 and later, and only in a build that bundled the widget
 * extension. Everywhere else this module has to do nothing at all rather than throw — the app
 * runs on Android, on the web, and in Expo Go, and a lock-screen ornament is not worth a crash
 * on any of them.
 */
async function moduleOrNull() {
  if (Platform.OS !== 'ios') return null;
  try { return await import('expo-live-activity'); } catch { return null; }
}

export function activityTitle(progress: DayProgress): string {
  const kcal = Math.round(progress.consumed.caloriesKcal);
  if (progress.targetKcal === null) return `${kcal.toLocaleString()} kcal logged`;
  const left = Math.round(progress.targetKcal - progress.consumed.caloriesKcal);
  return left >= 0 ? `${left.toLocaleString()} kcal left` : `${Math.abs(left).toLocaleString()} kcal over`;
}
export function activitySubtitle(progress: DayProgress): string {
  const { proteinG, carbsG, fatG } = progress.consumed;
  return `P ${Math.round(proteinG)} · C ${Math.round(carbsG)} · F ${Math.round(fatG)}`;
}
/** Clamped, because a bar that runs past its end says less than one that sits full. */
export function activityProgress(progress: DayProgress): number | undefined {
  if (progress.targetKcal === null || progress.targetKcal <= 0) return undefined;
  return Math.max(0, Math.min(1, progress.consumed.caloriesKcal / progress.targetKcal));
}
const stateFor = (progress: DayProgress) => {
  const fraction = activityProgress(progress);
  return { title: activityTitle(progress), subtitle: activitySubtitle(progress),
    ...(fraction === undefined ? {} : { progressBar: { progress: fraction } }) };
};

/** Starts the day's activity, or updates the one already running. Safe to call repeatedly. */
export async function startDay(progress: DayProgress): Promise<string | null> {
  const live = await moduleOrNull();
  if (!live) return null;
  if (current) return updateDay(progress);
  try {
    const id = live.startActivity(stateFor(progress));
    current = typeof id === 'string' ? id : null;
    return current;
  } catch { return null; }
}

export async function updateDay(progress: DayProgress): Promise<string | null> {
  const live = await moduleOrNull();
  if (!live || !current) return null;
  try { live.updateActivity(current, stateFor(progress)); } catch { /* A dismissed activity is not an error. */ }
  return current;
}

export async function endDay(progress: DayProgress): Promise<void> {
  const live = await moduleOrNull();
  if (!live || !current) { current = null; return; }
  try { live.stopActivity(current, stateFor(progress)); } catch { /* Already gone. */ }
  current = null;
}

/** For tests, and for a sign-out that must not leave an activity pinned to the lock screen. */
export const activeActivityId = () => current;
export function resetActivityForTests() { current = null; }
