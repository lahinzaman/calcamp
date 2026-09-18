begin;
-- Not every lift is weight times reps. A plank is seconds, a farmer carry is metres, a pull-up
-- is reps with whatever you added. And a set is not just "warm-up or not": a drop set and a set
-- taken to failure are both work, and both worth telling apart from a straight working set.
alter table public.exercises
  add column tracking_type text not null default 'weight_reps'
    check (tracking_type in ('weight_reps', 'bodyweight_reps', 'duration', 'distance_duration'));

alter table public.sets
  add column duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 86400),
  add column distance_m numeric(12,3) check (distance_m is null or (distance_m > 0 and distance_m <= 1000000)),
  add column set_type text not null default 'normal'
    check (set_type in ('normal', 'warmup', 'drop', 'failure'));

-- set_type subsumes is_warmup and says more. Keeping both would mean two columns that must
-- agree forever, so the old one is carried over and retired rather than left to drift.
update public.sets set set_type = 'warmup' where is_warmup;

-- A completed set needed weight and reps, which a plank can never supply. It now needs only to
-- have been measured by something. PostgreSQL named the original unnamed table check
-- `sets_check`; its replacement is named so this is never a guess again.
alter table public.sets drop constraint sets_check;
alter table public.sets add constraint sets_completed_has_a_measurement
  check (not is_completed or reps is not null or duration_seconds is not null or distance_m is not null);

-- A row check cannot see which exercise a set belongs to, so it can only insist that a
-- completed set was measured by *something*. Which measurement is the right one depends on the
-- exercise: reps and load for a bench press, seconds for a plank, metres for a carry. This is
-- where that is enforced, so the database cannot hold a plank recorded as five reps.
create function public.validate_set_measurements() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kind text;
begin
  if not new.is_completed then return new; end if;
  select tracking_type into kind from public.exercises where id = new.exercise_id;
  if kind = 'weight_reps' and (new.weight_kg is null or new.reps is null) then
    raise exception 'This exercise is measured in weight and reps' using errcode = '23514';
  elsif kind = 'bodyweight_reps' and new.reps is null then
    raise exception 'This exercise is measured in reps' using errcode = '23514';
  elsif kind = 'duration' and new.duration_seconds is null then
    raise exception 'This exercise is measured in time' using errcode = '23514';
  elsif kind = 'distance_duration' and new.distance_m is null then
    raise exception 'This exercise is measured in distance' using errcode = '23514';
  end if;
  -- A measurement the exercise does not have is not a detail to ignore; it is wrong data.
  if kind in ('duration', 'distance_duration') and new.reps is not null then
    raise exception 'This exercise is not measured in reps' using errcode = '23514';
  end if;
  if kind in ('weight_reps', 'bodyweight_reps') and (new.duration_seconds is not null or new.distance_m is not null) then
    raise exception 'This exercise is not measured in time or distance' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger set_measurements before insert or update on public.sets
  for each row execute function public.validate_set_measurements();


-- Reads set_type now, and treats absent load as zero load: NULL weight on a bodyweight set made
-- `weight_kg * reps` NULL, which would have made the workout's volume NULL against a not-null
-- column. A drop set and a set to failure are work, and are counted; a warm-up is not.
create or replace function public.update_workout_volume() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_volume numeric := 0; new_volume numeric := 0;
begin
  if tg_op <> 'INSERT' and old.is_completed and old.set_type <> 'warmup' then
    old_volume := coalesce(old.weight_kg, 0) * coalesce(old.reps, 0);
  end if;
  if tg_op <> 'DELETE' and new.is_completed and new.set_type <> 'warmup' then
    new_volume := coalesce(new.weight_kg, 0) * coalesce(new.reps, 0);
  end if;
  if tg_op = 'UPDATE' and old.workout_id = new.workout_id then
    update public.workouts set volume_kg_reps = volume_kg_reps + new_volume - old_volume where id = new.workout_id;
  else
    if tg_op <> 'INSERT' then
      update public.workouts set volume_kg_reps = volume_kg_reps - old_volume where id = old.workout_id;
    end if;
    if tg_op <> 'DELETE' then
      update public.workouts set volume_kg_reps = volume_kg_reps + new_volume where id = new.workout_id;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.update_workout_volume(), public.validate_set_measurements() from public, anon, authenticated;

alter table public.sets drop column is_warmup;

-- An exercise you created is yours to write, which the app could not do before.
grant insert, update on public.exercises to authenticated;
commit;
