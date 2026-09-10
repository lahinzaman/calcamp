import { kgToLbs, lbsToKg } from '../lib/units';
import type { NutritionMutation } from '../modules/sync/engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import { v5 as uuid } from 'uuid';
import type { MacroTotals, MicronutrientTotals } from '../types/nutrition';
import type { CompletedWorkout } from '../types/workout';

export interface DailyTotals {
  date: string;
  consumedMacros: MacroTotals;
  consumedMicros: MicronutrientTotals;
  isAdherent: boolean;
  bodyWeightLbs: number | null;
}
export interface TrackingRepository {
  userId(): Promise<string>;
  applyNutritionMutation?(userId: string, id: string, mutation: NutritionMutation): Promise<DailyTotals>;
  loadDay(userId: string, date: string): Promise<DailyTotals | null>;
  saveDay(userId: string, totals: DailyTotals): Promise<void>;
  saveWorkout(userId: string, workout: CompletedWorkout): Promise<string>;
}
function check(error: { message: string } | null) {
  if (error) throw Object.assign(new Error(error.message), error);
}
function dateKey(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function createTrackingRepository(client: SupabaseClient): TrackingRepository {
  async function verify(userId: string) {
    const { data, error } = await client.auth.getUser();
    check(error);
    if (!data.user || data.user.id !== userId) throw new Error('Sign in to the original account before syncing.');
  }
  async function ensureProfile(userId: string) {
    await verify(userId);
    // DO NOTHING preserves an existing profile and its measurements/advanced settings.
    const { error } = await client.from('users').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
    check(error);
  }
  return {
    async applyNutritionMutation(userId, id, mutation) {
      await verify(userId);
      const { data, error } = await client.rpc('apply_nutrition_mutation', {
        p_id: id, p_date: mutation.date, p_macros: mutation.macros, p_micros: mutation.micros, p_patch: mutation.legacyMetricPatch ?? { ...(mutation.patch.isAdherent === undefined ? {} : { isAdherent: mutation.patch.isAdherent }), ...(!('bodyWeightLbs' in mutation.patch) ? {} : { bodyWeightKg: mutation.patch.bodyWeightLbs === null ? null : lbsToKg(mutation.patch.bodyWeightLbs!) }) },
      });
      check(error);
      if (!data || data.user_id !== userId || data.log_date !== mutation.date) throw new Error('Invalid sync response.');
      return { date: data.log_date, consumedMacros: { caloriesKcal: Number(data.calories_kcal), proteinG: Number(data.protein_g),
        carbsG: Number(data.carbs_g), fatG: Number(data.fat_g) }, consumedMicros: data.micronutrients,
        isAdherent: data.is_adherent, bodyWeightLbs: data.body_weight_kg === null ? null : kgToLbs(Number(data.body_weight_kg)) };
    },
    async userId() {
      const { data, error } = await client.auth.getUser();
      check(error);
      if (!data.user) throw new Error('Sign in to sync with Supabase.');
      return data.user.id;
    },
    async loadDay(userId, date) {
      await verify(userId);
      const { data, error } = await client.from('daily_nutrition_logs')
        .select('log_date,calories_kcal,protein_g,carbs_g,fat_g,micronutrients,is_adherent,body_weight_kg')
        .eq('user_id', userId).eq('log_date', date).maybeSingle();
      check(error);
      if (!data) return null;
      // Partial remote macro totals cannot safely hydrate a complete local aggregate.
      if ([data.calories_kcal, data.protein_g, data.carbs_g, data.fat_g].some(x => x === null)) {
        throw new Error('Cloud diary has incomplete macros. Correct that entry before loading it.');
      }
      return { date: data.log_date, consumedMacros: { caloriesKcal: Number(data.calories_kcal),
        proteinG: Number(data.protein_g), carbsG: Number(data.carbs_g), fatG: Number(data.fat_g) },
      consumedMicros: data.micronutrients, isAdherent: data.is_adherent,
      bodyWeightLbs: data.body_weight_kg === null ? null : kgToLbs(Number(data.body_weight_kg)) };
    },
    async saveDay(userId, totals) {
      await ensureProfile(userId);
      const m = totals.consumedMacros;
      const { error } = await client.from('daily_nutrition_logs').upsert({ user_id: userId,
        log_date: totals.date, calories_kcal: m.caloriesKcal, protein_g: m.proteinG,
        carbs_g: m.carbsG, fat_g: m.fatG, micronutrients: totals.consumedMicros,
        body_weight_kg: totals.bodyWeightLbs === null ? null : lbsToKg(totals.bodyWeightLbs), is_adherent: totals.isAdherent,
      }, { onConflict: 'user_id,log_date' });
      check(error);
    },
    async saveWorkout(userId, workout) {
      await ensureProfile(userId);
      const id = uuid(`${userId}/${workout.session.id}`, uuid.URL);
      const completed = workout.sets.filter(s => s.completedAtMs !== null);
      // Stable IDs and immutable queued snapshots make retry after an ambiguous response safe.
      const { error: insertError } = await client.from('workouts').upsert({ id, user_id: userId,
        workout_date: dateKey(workout.session.startedAtMs), name: workout.session.name,
        started_at: new Date(workout.session.startedAtMs).toISOString(),
      }, { onConflict: 'id', ignoreDuplicates: true });
      check(insertError);
      const { data: existing, error: readError } = await client.from('workouts')
        .select('finished_at').eq('id', id).eq('user_id', userId).single();
      check(readError);
      if (existing?.finished_at) return id;
      const positions = new Map(workout.exercises.map((e, i) => [e.id, { id: e.exercise.id, position: i + 1 }]));
      const counts = new Map<string, number>();
      const rows = completed.map(s => {
        const exercise = positions.get(s.sessionExerciseId);
        if (!exercise) throw new Error('Set refers to an unknown exercise.');
        const position = (counts.get(s.sessionExerciseId) ?? 0) + 1;
        counts.set(s.sessionExerciseId, position);
        return { workout_id: id, exercise_id: exercise.id, exercise_position: exercise.position,
          set_position: position, weight_kg: s.weightLbs === null ? null : lbsToKg(s.weightLbs), reps: s.reps, rpe: s.rpe,
          is_warmup: s.isWarmup, is_completed: true, rest_seconds: s.restSeconds,
          completed_at: new Date(s.completedAtMs!).toISOString() };
      });
      // estimated_1rm_kg and volume_kg_reps are generated by the schema, never client-written.
      if (rows.length) {
        const { error } = await client.from('sets').upsert(rows, { onConflict: 'workout_id,exercise_position,set_position' });
        check(error);
      }
      await verify(userId);
      const { error } = await client.from('workouts').update({
        finished_at: new Date(workout.endedAtMs).toISOString(),
        duration_seconds: Math.floor((workout.endedAtMs - workout.session.startedAtMs) / 1000),
      }).eq('id', id).eq('user_id', userId).select('id').single();
      check(error);
      return id;
    },
  };
}
let repository: TrackingRepository | undefined;
export async function getTrackingRepository() {
  if (!repository) {
    const { getSupabase } = await import('./supabase');
    repository = createTrackingRepository(getSupabase());
  }
  return repository;
}
