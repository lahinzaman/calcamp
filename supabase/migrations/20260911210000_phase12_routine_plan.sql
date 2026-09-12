begin;
-- Routines gain per-exercise sets, rest and rep range, plus how often they run in a week.
-- exercise_ids stays authoritative for the visibility trigger; the plan mirrors it in order.
alter table public.workout_routines
  add column exercise_plan jsonb check (exercise_plan is null or (jsonb_typeof(exercise_plan) = 'array' and jsonb_array_length(exercise_plan) between 1 and 30)),
  add column times_per_week smallint check (times_per_week is null or times_per_week between 1 and 7);
-- Routines are replaced wholesale when edited, so updates must be permitted.
create policy routines_update on public.workout_routines for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant update on public.workout_routines to authenticated;
commit;
