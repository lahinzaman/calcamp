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
  /** Removes a session and, by cascade, its sets and per-exercise notes. */
  deleteWorkout(userId: string, sessionId: string): Promise<void>;
}
/** The row id a session gets in the cloud. Derived, so a retry addresses the same workout. */
export const workoutRowId = (userId: string, sessionId: string) => uuid(`${userId}/${sessionId}`, uuid.URL);
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
  /** Drops rows an edit no longer has, addressed by id so a composite key needs no filter dance. */
  async function pruneSets(workoutId: string, keep: string[]) {
    const kept = new Set(keep);
    const { data, error } = await client.from('sets')
      .select('id, exercise_position, set_position').eq('workout_id', workoutId);
    check(error);
    const stale = (data ?? []).filter(row => !kept.has(`${row.exercise_position}:${row.set_position}`)).map(row => row.id);
    if (!stale.length) return;
    const { error: deleteError } = await client.from('sets').delete().in('id', stale);
    check(deleteError);
  }
  /** A note belongs to an exercise's place in the session, the same key its sets use. */
  async function saveExerciseNotes(workoutId: string, workout: CompletedWorkout) {
    const rows = workout.exercises
      .map((entry, index) => ({ workout_id: workoutId, exercise_position: index + 1, note: entry.note?.trim() ?? '' }))
      .filter(row => row.note.length > 0);
    if (rows.length) {
      const { error } = await client.from('workout_exercise_notes')
        .upsert(rows, { onConflict: 'workout_id,exercise_position' });
      check(error);
    }
    const kept = rows.map(row => row.exercise_position);
    const query = client.from('workout_exercise_notes').delete().eq('workout_id', workoutId);
    // A cleared note is a deletion; with none left, every row for this workout goes.
    const { error } = await (kept.length ? query.not('exercise_position', 'in', `(${kept.join(',')})`) : query);
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
      // Write-once, so a retry after an ambiguous response cannot double up — unless the caller
      // is deliberately revising a session that was already saved.
      if (existing?.finished_at && !workout.editedAtMs) return id;
      const positions = new Map(workout.exercises.map((e, i) => [e.id, { id: e.exercise.id, position: i + 1 }]));
      const counts = new Map<string, number>();
      const rows = completed.map(s => {
        const exercise = positions.get(s.sessionExerciseId);
        if (!exercise) throw new Error('Set refers to an unknown exercise.');
        const position = (counts.get(s.sessionExerciseId) ?? 0) + 1;
        counts.set(s.sessionExerciseId, position);
        return { workout_id: id, exercise_id: exercise.id, exercise_position: exercise.position,
          set_position: position, weight_kg: s.weightLbs === null ? null : lbsToKg(s.weightLbs), reps: s.reps, rpe: s.rpe,
          duration_seconds: s.durationSeconds, distance_m: s.distanceMeters, set_type: s.kind,
          is_completed: true, rest_seconds: s.restSeconds,
          completed_at: new Date(s.completedAtMs!).toISOString() };
      });
      // estimated_1rm_kg and volume_kg_reps are generated by the schema, never client-written.
      if (rows.length) {
        const { error } = await client.from('sets').upsert(rows, { onConflict: 'workout_id,exercise_position,set_position' });
        check(error);
      }
      // Written after the upsert, never before: a set the edit removed must not be deleted
      // until its replacements are safely in, or a failure here would lose both.
      await pruneSets(id, rows.map(row => `${row.exercise_position}:${row.set_position}`));
      await saveExerciseNotes(id, workout);
      await verify(userId);
      const { error } = await client.from('workouts').update({
        name: workout.session.name,
        workout_date: dateKey(workout.session.startedAtMs),
        started_at: new Date(workout.session.startedAtMs).toISOString(),
        finished_at: new Date(workout.endedAtMs).toISOString(),
        duration_seconds: Math.floor((workout.endedAtMs - workout.session.startedAtMs) / 1000),
      }).eq('id', id).eq('user_id', userId).select('id').single();
      check(error);
      return id;
    },
    async deleteWorkout(userId, sessionId) {
      await verify(userId);
      // Sets and exercise notes both cascade from the workout row.
      const { error } = await client.from('workouts').delete()
        .eq('id', workoutRowId(userId, sessionId)).eq('user_id', userId);
      check(error);
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
