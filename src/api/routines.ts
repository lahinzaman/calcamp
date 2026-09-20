import { getSupabase } from './supabase';
import { validateRoutine, type WorkoutRoutine } from '../modules/workout/routines';
/**
 * A real upsert, not ignore-duplicates. It was the latter, which is ON CONFLICT DO NOTHING, so
 * every edit to a routine that already existed was accepted by the server and silently discarded
 * — the schema grants an update policy precisely because a routine is replaced wholesale when
 * edited. Rewriting the same row on a retry is just as idempotent as skipping it.
 */
export async function saveRoutine(owner: string, routine: WorkoutRoutine, client = getSupabase()) {
  validateRoutine(routine);
  const { error } = await client.from('workout_routines').upsert({ id:routine.id, user_id:owner, name:routine.name,
    exercise_ids:routine.exerciseIds, exercise_plan:routine.exercises ?? null, times_per_week:routine.timesPerWeek ?? null }, {onConflict:'id'});
  if (error) throw Object.assign(new Error('Routine could not sync.'), {code:error.code});
}
export async function loadRoutines(owner: string): Promise<WorkoutRoutine[]> {
  const {data,error} = await getSupabase().from('workout_routines').select('id,name,exercise_ids,exercise_plan,times_per_week').eq('user_id',owner).order('created_at');
  if (error) throw new Error('Saved routines are unavailable.');
  return (data ?? []).map(row => ({id:row.id,name:row.name,exerciseIds:row.exercise_ids,
    exercises:row.exercise_plan ?? undefined, timesPerWeek:row.times_per_week ?? undefined}));
}
