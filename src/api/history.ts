import { getSupabase } from './supabase';
import { kgToLbs } from '../lib/units';
import type { TdeeDailyLog } from '../modules/nutrition/tdee';
import type { FoodEntry } from '../types/foodEntry';
import { rowToFoodEntry } from './foodEntries';
export interface HistoryDay extends TdeeDailyLog {
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}
function check(error: { message: string } | null) { if (error) throw Object.assign(new Error(error.message), error); }
export function shiftDate(date: string, days: number) {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed)) throw new RangeError('Use a valid YYYY-MM-DD date.');
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}
/** Cloud rows for a closed date range, converted to the app's Imperial units. */
export async function loadHistory(userId: string, from: string, to: string, client = getSupabase()): Promise<HistoryDay[]> {
  const { data, error } = await client.from('daily_nutrition_logs')
    .select('log_date,calories_kcal,protein_g,carbs_g,fat_g,is_adherent,body_weight_kg')
    .eq('user_id', userId).gte('log_date', from).lte('log_date', to).order('log_date');
  check(error);
  return (data ?? []).map(row => ({
    log_date: row.log_date,
    calories_kcal: row.calories_kcal === null ? null : Number(row.calories_kcal),
    proteinG: row.protein_g === null ? null : Number(row.protein_g),
    carbsG: row.carbs_g === null ? null : Number(row.carbs_g),
    fatG: row.fat_g === null ? null : Number(row.fat_g),
    is_adherent: !!row.is_adherent,
    body_weight_lbs: row.body_weight_kg === null ? null : kgToLbs(Number(row.body_weight_kg)),
  }));
}
export async function loadEntriesForRange(userId: string, from: string, to: string, client = getSupabase()): Promise<Record<string, FoodEntry[]>> {
  const { data, error } = await client.from('food_entries').select('*')
    .eq('user_id', userId).gte('log_date', from).lte('log_date', to).order('logged_at');
  check(error);
  const grouped: Record<string, FoodEntry[]> = {};
  for (const row of data ?? []) { const entry = rowToFoodEntry(row); (grouped[entry.date] ??= []).push(entry); }
  return grouped;
}
