import { getSupabase } from './supabase';
import type { FoodEntry } from '../types/foodEntry';
import type { SupabaseClient } from '@supabase/supabase-js';
function check(error: { message: string } | null) { if (error) throw Object.assign(new Error(error.message), error); }
export function foodEntryRow(userId: string, entry: FoodEntry) {
  return {
    id: entry.id, user_id: userId, log_date: entry.date, meal: entry.meal, name: entry.name,
    servings: entry.servings, serving_label: entry.servingLabel, source: entry.source,
    calories_kcal: entry.macros.caloriesKcal, protein_g: entry.macros.proteinG, carbs_g: entry.macros.carbsG, fat_g: entry.macros.fatG,
    micronutrients: entry.micros, reference_macros: entry.referenceMacros, reference_micros: entry.referenceMicros,
    logged_at: new Date(entry.loggedAtMs).toISOString(),
  };
}
export function rowToFoodEntry(row: Record<string, unknown>): FoodEntry {
  const reference = (row.reference_macros ?? {}) as Record<string, number>;
  return {
    id: String(row.id), date: String(row.log_date), meal: row.meal as FoodEntry['meal'], name: String(row.name),
    servings: Number(row.servings), servingLabel: row.serving_label === null ? null : String(row.serving_label),
    macros: { caloriesKcal: Number(row.calories_kcal), proteinG: Number(row.protein_g), carbsG: Number(row.carbs_g), fatG: Number(row.fat_g) },
    micros: (row.micronutrients ?? {}) as FoodEntry['micros'],
    referenceMacros: { caloriesKcal: Number(reference.caloriesKcal ?? 0), proteinG: Number(reference.proteinG ?? 0), carbsG: Number(reference.carbsG ?? 0), fatG: Number(reference.fatG ?? 0) },
    referenceMicros: (row.reference_micros ?? {}) as FoodEntry['micros'],
    source: row.source as FoodEntry['source'], loggedAtMs: Date.parse(String(row.logged_at)),
  };
}
async function verify(client: SupabaseClient, userId: string) {
  const { data, error } = await client.auth.getUser();
  check(error);
  if (!data.user || data.user.id !== userId) throw new Error('Sign in to the original account before syncing.');
}
export async function saveFoodEntry(userId: string, entry: FoodEntry, client = getSupabase()) {
  await verify(client, userId);
  const { error } = await client.from('food_entries').upsert(foodEntryRow(userId, entry), { onConflict: 'id' });
  check(error);
}
export async function deleteFoodEntry(userId: string, id: string, client = getSupabase()) {
  await verify(client, userId);
  const { error } = await client.from('food_entries').delete().eq('id', id).eq('user_id', userId);
  check(error);
}
export async function loadFoodEntries(userId: string, date: string, client = getSupabase()): Promise<FoodEntry[]> {
  await verify(client, userId);
  const { data, error } = await client.from('food_entries').select('*').eq('user_id', userId).eq('log_date', date).order('logged_at');
  check(error);
  return (data ?? []).map(rowToFoodEntry);
}
