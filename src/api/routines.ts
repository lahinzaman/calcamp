import { getSupabase } from './supabase';
import { validateRoutine, type WorkoutRoutine } from '../modules/workout/routines';
export async function saveRoutine(owner: string, routine: WorkoutRoutine) {
  validateRoutine(routine);
  const { error } = await getSupabase().from('workout_routines').upsert({ id:routine.id, user_id:owner, name:routine.name, exercise_ids:routine.exerciseIds }, {onConflict:'id', ignoreDuplicates:true});
  if (error) throw Object.assign(new Error('Routine could not sync.'), {code:error.code});
}
export async function loadRoutines(owner: string): Promise<WorkoutRoutine[]> {
  const {data,error} = await getSupabase().from('workout_routines').select('id,name,exercise_ids').eq('user_id',owner).order('created_at');
  if (error) throw new Error('Saved routines are unavailable.');
  return (data ?? []).map(row => ({id:row.id,name:row.name,exerciseIds:row.exercise_ids}));
}
