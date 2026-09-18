begin;
-- What you want to remember about a lift next time: seat height, pin number, which side lagged.
-- Notes belong to an exercise's occurrence within one session, not to the catalogue entry and
-- not to a single set, so they key on the same (workout, exercise_position) pair that sets use.
-- workouts.notes stays what it is: a note about the session as a whole.
create table public.workout_exercise_notes (
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_position integer not null check (exercise_position > 0),
  note text not null check (length(btrim(note)) between 1 and 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workout_id, exercise_position)
);
comment on table public.workout_exercise_notes is
  'One note per exercise occurrence in a session. exercise_position matches public.sets.exercise_position.';
create trigger workout_exercise_notes_updated_at before update on public.workout_exercise_notes
  for each row execute function public.set_updated_at();

alter table public.workout_exercise_notes enable row level security;
revoke all on public.workout_exercise_notes from public, anon, authenticated;
grant select, insert, update, delete on public.workout_exercise_notes to authenticated;
grant select, insert, update, delete on public.workout_exercise_notes to service_role;

-- Ownership is the parent workout's, exactly as it is for sets.
create policy workout_exercise_notes_own_select on public.workout_exercise_notes for select to authenticated using (
  exists (select 1 from public.workouts where id = workout_id and user_id = (select auth.uid())));
create policy workout_exercise_notes_own_insert on public.workout_exercise_notes for insert to authenticated with check (
  exists (select 1 from public.workouts where id = workout_id and user_id = (select auth.uid())));
create policy workout_exercise_notes_own_update on public.workout_exercise_notes for update to authenticated using (
  exists (select 1 from public.workouts where id = workout_id and user_id = (select auth.uid()))) with check (
  exists (select 1 from public.workouts where id = workout_id and user_id = (select auth.uid())));
create policy workout_exercise_notes_own_delete on public.workout_exercise_notes for delete to authenticated using (
  exists (select 1 from public.workouts where id = workout_id and user_id = (select auth.uid())));
commit;
