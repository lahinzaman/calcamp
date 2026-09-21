import { getSupabase } from './supabase';
export interface ActivityDay {
  activity_date: string; steps: number | null; active_energy_kcal: number | null; source: string;
  distance_m?: number | null; duration_seconds?: number | null; steps_estimated?: boolean;
  /** Of the steps on this day, how many came from a treadmill read rather than a device. */
  manual_steps?: number;
}
/**
 * One row per day.
 *
 * healthkit and health-connect are two views of the same walking — a phone and a watch counting
 * the same steps — so the better-covered of them is taken rather than both. A treadmill read is
 * ground the device never saw, so it adds on top. Summing all three would double-count a day
 * where both a phone and a watch reported; taking only the best would discard the treadmill.
 */
export async function loadActivity(userId: string, from: string, to: string, client = getSupabase()): Promise<ActivityDay[]> {
  const { data, error } = await client.from('daily_activity_snapshots')
    .select('activity_date,steps,active_energy_kcal,source,distance_m,duration_seconds,steps_estimated')
    .eq('user_id', userId).gte('activity_date', from).lte('activity_date', to).order('activity_date');
  if (error) throw Object.assign(new Error(error.message), error);
  const number = (value: unknown) => value === null || value === undefined ? null : Number(value);
  const device = new Map<string, ActivityDay>();
  const manual = new Map<string, ActivityDay>();
  for (const row of data ?? []) {
    const day: ActivityDay = { activity_date: row.activity_date, source: row.source,
      steps: number(row.steps), active_energy_kcal: number(row.active_energy_kcal),
      distance_m: number(row.distance_m), duration_seconds: number(row.duration_seconds),
      steps_estimated: row.steps_estimated === true };
    if (row.source === 'treadmill') { manual.set(day.activity_date, day); continue; }
    const existing = device.get(day.activity_date);
    if (!existing || (day.steps ?? -1) > (existing.steps ?? -1)) device.set(day.activity_date, day);
  }
  const dates = [...new Set([...device.keys(), ...manual.keys()])].sort((a, b) => a.localeCompare(b));
  return dates.map(date => {
    const measured = device.get(date);
    const added = manual.get(date);
    if (!added) return { ...measured!, manual_steps: 0 };
    const base = measured ?? { activity_date: date, steps: null, active_energy_kcal: null, source: 'treadmill' };
    return {
      ...base,
      source: measured ? `${measured.source}+treadmill` : 'treadmill',
      // A day with a treadmill read but no device reading is the treadmill's steps, not null.
      steps: (measured?.steps ?? 0) + (added.steps ?? 0) || (added.steps ?? measured?.steps ?? null),
      active_energy_kcal: (measured?.active_energy_kcal ?? null) === null && added.active_energy_kcal === null
        ? null : (measured?.active_energy_kcal ?? 0) + (added.active_energy_kcal ?? 0),
      distance_m: added.distance_m, duration_seconds: added.duration_seconds,
      steps_estimated: added.steps_estimated,
      manual_steps: added.steps ?? 0,
    };
  });
}
