import { getSupabase } from './supabase';
export interface ActivityDay { activity_date: string; steps: number | null; active_energy_kcal: number | null; source: string }
/**
 * One row per day, preferring the source that reported the most steps when a device has
 * backed up through both HealthKit and Health Connect.
 */
export async function loadActivity(userId: string, from: string, to: string, client = getSupabase()): Promise<ActivityDay[]> {
  const { data, error } = await client.from('daily_activity_snapshots')
    .select('activity_date,steps,active_energy_kcal,source')
    .eq('user_id', userId).gte('activity_date', from).lte('activity_date', to).order('activity_date');
  if (error) throw Object.assign(new Error(error.message), error);
  const best = new Map<string, ActivityDay>();
  for (const row of data ?? []) {
    const day: ActivityDay = { activity_date: row.activity_date, source: row.source,
      steps: row.steps === null ? null : Number(row.steps),
      active_energy_kcal: row.active_energy_kcal === null ? null : Number(row.active_energy_kcal) };
    const existing = best.get(day.activity_date);
    if (!existing || (day.steps ?? -1) > (existing.steps ?? -1)) best.set(day.activity_date, day);
  }
  return [...best.values()].sort((a, b) => a.activity_date.localeCompare(b.activity_date));
}
