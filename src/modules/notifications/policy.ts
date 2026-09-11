import { DEFAULT_UPPER_LOWER, type UserProfile } from '../../types/profile';
export interface NotificationPreferences {
  enabled: boolean; gymAlerts: boolean; gymThreshold: number; workoutReminders: boolean;
  workoutTime: string; nutritionReminders: boolean; nutritionTime: string; geofencing: boolean; uploadActivity: boolean;
  /** Weekly weigh-in prompt; the trend needs a regular reading to adjust a budget. */
  weighInReminders: boolean; weighInDay: number; weighInTime: string;
}
export const defaultPreferences: NotificationPreferences = { enabled: false, gymAlerts: false, gymThreshold: 30,
  workoutReminders: false, workoutTime: '17:00', nutritionReminders: false, nutritionTime: '20:00', geofencing: false, uploadActivity: false,
  weighInReminders: false, weighInDay: 0, weighInTime: '08:00' };
export function parsePreferences(value: unknown): NotificationPreferences {
  const p = { ...defaultPreferences, ...(value && typeof value === 'object' ? value : {}) };
  for (const k of ['enabled','gymAlerts','workoutReminders','nutritionReminders','geofencing','uploadActivity','weighInReminders'] as const) if (typeof p[k] !== 'boolean') throw new Error('Choose valid reminder settings.');
  if (!Number.isInteger(p.weighInDay) || p.weighInDay < 0 || p.weighInDay > 6) throw new Error('Choose a weekday for your weigh-in reminder.');
  if (!Number.isInteger(p.gymThreshold) || p.gymThreshold < 5 || p.gymThreshold > 95) throw new Error('Gym threshold must be between 5 and 95.');
  if (![p.workoutTime, p.nutritionTime, p.weighInTime].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error('Use a time such as 17:00.');
  return Object.fromEntries(Object.keys(defaultPreferences).map(k => [k, p[k as keyof NotificationPreferences]])) as unknown as NotificationPreferences;
}
export type NotificationRoute = '/(tabs)' | '/(tabs)/explore' | '/(tabs)/campus';
export function notificationRoute(data: unknown): NotificationRoute | null {
  const value = data as { kind?: unknown } | null;
  return value?.kind === 'workout' ? '/(tabs)/explore' : value?.kind === 'nutrition' || value?.kind === 'rescue' || value?.kind === 'weigh-in' ? '/(tabs)' : value?.kind === 'gym' ? '/(tabs)/campus' : null;
}
export interface Reminder { id: string; title: string; body: string; kind: 'workout' | 'nutrition' | 'weigh-in'; hour: number; minute: number; weekday?: number }
export function reminderPlan(p: NotificationPreferences, profile: UserProfile | null): Reminder[] {
  if (!p.enabled) return [];
  const result: Reminder[] = [];
  if (p.nutritionReminders) { const [hour, minute] = p.nutritionTime.split(':').map(Number); result.push({ id: 'nutrition', kind: 'nutrition', title: 'Time for your diary', body: 'Log your meals and any planned refeed.', hour, minute }); }
  if (p.weighInReminders) {
    const [hour, minute] = p.weighInTime.split(':').map(Number);
    result.push({ id: 'weigh-in', kind: 'weigh-in', title: 'Weekly weigh-in', body: 'Log your weight so CalCamp can adjust your targets from real data.', hour, minute, weekday: p.weighInDay + 1 });
  }
  if (p.workoutReminders && profile?.is_advanced_track) {
    const [hour, minute] = p.workoutTime.split(':').map(Number);
    const days = [...new Set(profile.training_days)].sort((a, b) => (a + 6) % 7 - (b + 6) % 7);
    days.forEach((day, index) => { if (Number.isInteger(day) && day >= 0 && day <= 6) result.push({ id: `workout-${day}`, kind: 'workout', title: `Time for ${DEFAULT_UPPER_LOWER[index]?.name ?? 'your workout'}`, body: 'Open your training log when you are ready.', hour, minute, weekday: day + 1 }); });
  }
  return result;
}
