-- RULocked Phase 1. Apply ONCE to a fresh Supabase database as postgres.
-- auth.users, auth.uid(), anon/authenticated/service_role are provided by Supabase.
-- This is a reviewed bootstrap schema, not a destructive reset or a live deployment.
-- Canonical units: centimeters, kilograms, kilocalories, grams, and seconds.
-- Calendar dates are the user's local day; timestamps are absolute timestamptz.
begin;

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  height_cm numeric(6,2) check (height_cm between 30 and 300),
  weight_kg numeric(7,3) check (weight_kg between 1 and 1000),
  dynamic_tdee_kcal numeric(8,2) check (dynamic_tdee_kcal > 0 and dynamic_tdee_kcal < 20000),
  is_advanced_track boolean not null default false,
  timezone text not null default 'America/New_York' check (length(trim(timezone)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mirrors src/types/nutrition.ts NUTRIENT_UNITS. Add keys through migrations.
-- RAE and DFE are distinct equivalents, not interchangeable plain micrograms.
create table public.nutrient_definitions (
  key text primary key,
  unit text not null check (unit in ('g', 'mg', 'mcg', 'mcg_rae', 'mcg_dfe'))
);

insert into public.nutrient_definitions (key, unit) values
  ('fiber_g', 'g'),
  ('soluble_fiber_g', 'g'),
  ('insoluble_fiber_g', 'g'),
  ('resistant_starch_g', 'g'),
  ('beta_glucan_g', 'g'),
  ('inulin_g', 'g'),
  ('sugar_g', 'g'),
  ('added_sugar_g', 'g'),
  ('sugar_alcohol_g', 'g'),
  ('starch_g', 'g'),
  ('saturated_fat_g', 'g'),
  ('monounsaturated_fat_g', 'g'),
  ('polyunsaturated_fat_g', 'g'),
  ('trans_fat_g', 'g'),
  ('omega_3_g', 'g'),
  ('omega_6_g', 'g'),
  ('ala_g', 'g'),
  ('epa_g', 'g'),
  ('dha_g', 'g'),
  ('cholesterol_mg', 'mg'),
  ('sodium_mg', 'mg'),
  ('potassium_mg', 'mg'),
  ('calcium_mg', 'mg'),
  ('iron_mg', 'mg'),
  ('magnesium_mg', 'mg'),
  ('phosphorus_mg', 'mg'),
  ('zinc_mg', 'mg'),
  ('copper_mg', 'mg'),
  ('manganese_mg', 'mg'),
  ('selenium_mcg', 'mcg'),
  ('iodine_mcg', 'mcg'),
  ('chromium_mcg', 'mcg'),
  ('molybdenum_mcg', 'mcg'),
  ('chloride_mg', 'mg'),
  ('fluoride_mg', 'mg'),
  ('vitamin_a_mcg_rae', 'mcg_rae'),
  ('retinol_mcg', 'mcg'),
  ('beta_carotene_mcg', 'mcg'),
  ('alpha_carotene_mcg', 'mcg'),
  ('lycopene_mcg', 'mcg'),
  ('lutein_zeaxanthin_mcg', 'mcg'),
  ('vitamin_c_mg', 'mg'),
  ('vitamin_d_mcg', 'mcg'),
  ('vitamin_e_mg', 'mg'),
  ('vitamin_k_mcg', 'mcg'),
  ('thiamin_b1_mg', 'mg'),
  ('riboflavin_b2_mg', 'mg'),
  ('niacin_b3_mg', 'mg'),
  ('pantothenic_acid_b5_mg', 'mg'),
  ('vitamin_b6_mg', 'mg'),
  ('biotin_b7_mcg', 'mcg'),
  ('folate_b9_mcg_dfe', 'mcg_dfe'),
  ('folic_acid_mcg', 'mcg'),
  ('vitamin_b12_mcg', 'mcg'),
  ('choline_mg', 'mg'),
  ('betaine_mg', 'mg'),
  ('histidine_g', 'g'),
  ('isoleucine_g', 'g'),
  ('leucine_g', 'g'),
  ('lysine_g', 'g'),
  ('methionine_g', 'g'),
  ('phenylalanine_g', 'g'),
  ('threonine_g', 'g'),
  ('tryptophan_g', 'g'),
  ('valine_g', 'g'),
  ('alanine_g', 'g'),
  ('arginine_g', 'g'),
  ('aspartic_acid_g', 'g'),
  ('asparagine_g', 'g'),
  ('cysteine_g', 'g'),
  ('cystine_g', 'g'),
  ('glutamic_acid_g', 'g'),
  ('glutamine_g', 'g'),
  ('glycine_g', 'g'),
  ('proline_g', 'g'),
  ('serine_g', 'g'),
  ('tyrosine_g', 'g'),
  ('water_g', 'g'),
  ('caffeine_mg', 'mg'),
  ('alcohol_g', 'g');

create table public.daily_nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  log_date date not null,
  calories_kcal numeric(12,3) check (calories_kcal >= 0 and calories_kcal < 'Infinity'::numeric),
  protein_g numeric(12,3) check (protein_g >= 0 and protein_g < 'Infinity'::numeric),
  carbs_g numeric(12,3) check (carbs_g >= 0 and carbs_g < 'Infinity'::numeric),
  fat_g numeric(12,3) check (fat_g >= 0 and fat_g < 'Infinity'::numeric),
  micronutrients jsonb not null default '{}'::jsonb check (jsonb_typeof(micronutrients) = 'object'),
  body_weight_kg numeric(7,3) check (body_weight_kg between 1 and 1000),
  is_adherent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date),
  check (not is_adherent or (calories_kcal is not null and protein_g is not null
    and carbs_g is not null and fat_g is not null))
);
comment on column public.daily_nutrition_logs.micronutrients is
  'Known daily subtotals keyed by nutrient_definitions.key. Omission means unreported; zero means a reported zero. Never infer nutrient completeness from is_adherent.';
comment on column public.daily_nutrition_logs.is_adherent is
  'User-confirmed complete intake logging for future TDEE fitting. Missing days are not zero-intake days. Micros may remain unreported on adherent days.';
comment on column public.daily_nutrition_logs.body_weight_kg is
  'Optional daily measurement retained separately from current users.weight_kg for later weight-trend/TDEE calculation.';

create function public.validate_micronutrients() returns trigger
language plpgsql set search_path = '' as $$
declare item record;
begin
  if jsonb_typeof(new.micronutrients) <> 'object' then
    raise exception 'micronutrients must be an object' using errcode = '23514';
  end if;
  for item in select key, value from jsonb_each(new.micronutrients) loop
    if not exists (select 1 from public.nutrient_definitions where key = item.key) then
      raise exception 'Unknown nutrient key: %', item.key using errcode = '23514';
    end if;
    if jsonb_typeof(item.value) <> 'number' then
      raise exception 'Nutrient % must be a nonnegative number; omit unknown values', item.key using errcode = '23514';
    end if;
    if (item.value #>> '{}')::numeric < 0 or (item.value #>> '{}')::numeric > 1.7976931348623157e308 then
      raise exception 'Nutrient % must be finite and nonnegative', item.key using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
create trigger daily_nutrition_micronutrients
  before insert or update of micronutrients on public.daily_nutrition_logs
  for each row execute function public.validate_micronutrients();

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workout_date date not null,
  name text not null default 'Workout' check (length(trim(name)) > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_seconds integer check (duration_seconds >= 0),
  volume_kg_reps numeric(18,3) not null default 0 check (volume_kg_reps >= 0 and volume_kg_reps < 'Infinity'::numeric),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (finished_at is null or finished_at >= started_at)
);
comment on column public.workouts.volume_kg_reps is
  'Automatically summed completed non-warmup sets: external load in kg * reps. Excludes body mass and uncompleted sets; not an energy-expenditure measure.';
create index workouts_user_date_idx on public.workouts (user_id, workout_date desc);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  movement_pattern text not null check (length(trim(movement_pattern)) > 0),
  equipment text not null check (length(trim(equipment)) > 0),
  primary_muscle text not null check (length(trim(primary_muscle)) > 0),
  secondary_muscles text[] not null default '{}',
  grip_orientation text check (grip_orientation in ('pronated', 'supinated', 'neutral', 'mixed', 'other')),
  grip_width text check (grip_width in ('narrow', 'shoulder_width', 'wide', 'other')),
  body_position text,
  laterality text not null default 'bilateral' check (laterality in ('bilateral', 'unilateral', 'alternating')),
  range_of_motion text,
  variation_notes text,
  default_rest_seconds integer not null default 120 check (default_rest_seconds between 0 and 3600),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.exercises.owner_user_id is
  'NULL is a shared server-managed catalogue lift. Non-null exercises are private custom variations. Archive used exercises instead of deleting historical set references.';
create index exercises_owner_idx on public.exercises (owner_user_id);

-- Distinct catalogue examples preserve mechanical differences in history.
insert into public.exercises (id, name, movement_pattern, equipment, primary_muscle,
  grip_orientation, grip_width, body_position, variation_notes) values
  ('10000000-0000-4000-8000-000000000001', 'High-Pronated Grip Row', 'horizontal_pull', 'cable', 'upper_back',
    'pronated', 'wide', 'seated', 'High cable path; pronated grip.'),
  ('10000000-0000-4000-8000-000000000002', 'Neutral Grip Lat Pulldown', 'vertical_pull', 'cable', 'lats',
    'neutral', 'shoulder_width', 'seated', 'Neutral handles; vertical pulling path.');

create table public.sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  exercise_position integer not null check (exercise_position > 0),
  set_position integer not null check (set_position > 0),
  weight_kg numeric(9,3) check (weight_kg >= 0 and weight_kg < 'Infinity'::numeric),
  reps integer check (reps between 1 and 1000),
  rpe numeric(3,1) check (rpe between 1 and 10),
  is_warmup boolean not null default false,
  is_completed boolean not null default false,
  rest_seconds integer check (rest_seconds between 0 and 3600),
  completed_at timestamptz,
  estimated_1rm_kg numeric generated always as (
    case when is_completed and weight_kg > 0 and reps = 1 then weight_kg
      when is_completed and weight_kg > 0 and reps between 2 and 12
        then round(weight_kg * (36 / (37 - reps::numeric)), 3)
      else null end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_id, exercise_position, set_position),
  check (not is_completed or (weight_kg is not null and reps is not null))
);
comment on column public.sets.estimated_1rm_kg is
  'Brzycki estimate matching the frontend for completed loaded sets of 2-12 reps; one rep uses actual load. Other cases are NULL. This is an estimate, not a prescription.';
comment on column public.sets.exercise_position is
  'One-based exercise occurrence in session order; repeating the same exercise later may use another position.';
create index sets_exercise_idx on public.sets (exercise_id);

-- Check even service-role writes: private exercises must belong to the workout owner.
create function public.validate_set_ownership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.workouts w join public.exercises e on e.id = new.exercise_id
    where w.id = new.workout_id and (e.owner_user_id is null or e.owner_user_id = w.user_id)
  ) then
    raise exception 'Exercise must be accessible to the workout owner' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger set_ownership before insert or update of workout_id, exercise_id on public.sets
  for each row execute function public.validate_set_ownership();

-- Atomic deltas prevent concurrent set writes from losing volume updates.
create function public.update_workout_volume() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_volume numeric := 0; new_volume numeric := 0;
begin
  if tg_op <> 'INSERT' and old.is_completed and not old.is_warmup then
    old_volume := old.weight_kg * old.reps;
  end if;
  if tg_op <> 'DELETE' and new.is_completed and not new.is_warmup then
    new_volume := new.weight_kg * new.reps;
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
create trigger set_workout_volume after insert or update or delete on public.sets
  for each row execute function public.update_workout_volume();

create table public.gym_locations (
  slug text primary key,
  name text not null unique
);
insert into public.gym_locations (slug, name) values
  ('werblin', 'Werblin'), ('college-ave', 'College Ave'), ('cook-douglass', 'Cook/Douglass');

create table public.gym_busyness_votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  location_slug text not null references public.gym_locations (slug),
  status text not null check (status in ('Quiet', 'Normal', 'Packed')),
  created_at timestamptz not null default now()
);
create index gym_votes_location_time_idx on public.gym_busyness_votes (location_slug, created_at desc);
create index gym_votes_user_time_idx on public.gym_busyness_votes (user_id, created_at desc);
comment on table public.gym_busyness_votes is
  'Raw votes are private to the voter; a later server-side aggregation can expose busyness without publishing user location history. Timestamps are server-assigned.';

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger users_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger nutrition_updated_at before update on public.daily_nutrition_logs for each row execute function public.set_updated_at();
create trigger workouts_updated_at before update on public.workouts for each row execute function public.set_updated_at();
create trigger exercises_updated_at before update on public.exercises for each row execute function public.set_updated_at();
create trigger sets_updated_at before update on public.sets for each row execute function public.set_updated_at();

-- Explicit grants and RLS protect every public table; no anonymous access.
alter table public.users enable row level security;
alter table public.nutrient_definitions enable row level security;
alter table public.daily_nutrition_logs enable row level security;
alter table public.workouts enable row level security;
alter table public.exercises enable row level security;
alter table public.sets enable row level security;
alter table public.gym_locations enable row level security;
alter table public.gym_busyness_votes enable row level security;

revoke all on public.users, public.nutrient_definitions, public.daily_nutrition_logs,
  public.workouts, public.exercises, public.sets, public.gym_locations, public.gym_busyness_votes from public, anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.users, public.daily_nutrition_logs,
  public.exercises, public.sets to authenticated;
grant select on public.nutrient_definitions, public.gym_locations to authenticated;
grant select, delete on public.workouts to authenticated;
grant insert (id, user_id, workout_date, name, started_at, finished_at, duration_seconds, notes),
  update (workout_date, name, started_at, finished_at, duration_seconds, notes) on public.workouts to authenticated;
grant select, delete on public.gym_busyness_votes to authenticated;
grant insert (id, user_id, location_slug, status), update (status) on public.gym_busyness_votes to authenticated;
grant all on public.users, public.nutrient_definitions, public.daily_nutrition_logs,
  public.workouts, public.exercises, public.sets, public.gym_locations, public.gym_busyness_votes to service_role;

create policy users_own_select on public.users for select to authenticated using (id = (select auth.uid()));
create policy users_own_insert on public.users for insert to authenticated with check (id = (select auth.uid()));
create policy users_own_update on public.users for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy users_own_delete on public.users for delete to authenticated using (id = (select auth.uid()));

create policy nutrient_definitions_read on public.nutrient_definitions for select to authenticated using (true);
create policy gym_locations_read on public.gym_locations for select to authenticated using (true);

create policy nutrition_own_select on public.daily_nutrition_logs for select to authenticated using (user_id = (select auth.uid()));
create policy nutrition_own_insert on public.daily_nutrition_logs for insert to authenticated with check (user_id = (select auth.uid()));
create policy nutrition_own_update on public.daily_nutrition_logs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy nutrition_own_delete on public.daily_nutrition_logs for delete to authenticated using (user_id = (select auth.uid()));

create policy workouts_own_select on public.workouts for select to authenticated using (user_id = (select auth.uid()));
create policy workouts_own_insert on public.workouts for insert to authenticated with check (user_id = (select auth.uid()));
create policy workouts_own_update on public.workouts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy workouts_own_delete on public.workouts for delete to authenticated using (user_id = (select auth.uid()));

create policy exercises_read_accessible on public.exercises for select to authenticated using (owner_user_id is null or owner_user_id = (select auth.uid()));
create policy exercises_own_insert on public.exercises for insert to authenticated with check (owner_user_id = (select auth.uid()));
create policy exercises_own_update on public.exercises for update to authenticated using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
create policy exercises_own_delete on public.exercises for delete to authenticated using (owner_user_id = (select auth.uid()));

create policy sets_own_select on public.sets for select to authenticated using (
  exists (select 1 from public.workouts where id = workout_id and user_id = (select auth.uid())));
create policy sets_own_insert on public.sets for insert to authenticated with check (
  exists (select 1 from public.workouts where id = workout_id and user_id = (select auth.uid())) and
  exists (select 1 from public.exercises where id = exercise_id and (owner_user_id is null or owner_user_id = (select auth.uid()))));
create policy sets_own_update on public.sets for update to authenticated using (
  exists (select 1 from public.workouts where id = workout_id and user_id = (select auth.uid()))) with check (
  exists (select 1 from public.workouts where id = workout_id and user_id = (select auth.uid())) and
  exists (select 1 from public.exercises where id = exercise_id and (owner_user_id is null or owner_user_id = (select auth.uid()))));
create policy sets_own_delete on public.sets for delete to authenticated using (
  exists (select 1 from public.workouts where id = workout_id and user_id = (select auth.uid())));

create policy gym_votes_own_select on public.gym_busyness_votes for select to authenticated using (user_id = (select auth.uid()));
create policy gym_votes_own_insert on public.gym_busyness_votes for insert to authenticated with check (user_id = (select auth.uid()));
create policy gym_votes_own_update on public.gym_busyness_votes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy gym_votes_own_delete on public.gym_busyness_votes for delete to authenticated using (user_id = (select auth.uid()));

-- Trigger functions cannot be invoked as public RPCs. PostgreSQL invokes them via triggers.
revoke all on function public.validate_micronutrients(), public.validate_set_ownership(),
  public.update_workout_volume(), public.set_updated_at() from public, anon, authenticated;

commit;

-- Phase 4 additions for a fresh install.
-- Upgrade the Phase 1–3 schema. Run as the database owner; no raw vote histories are made public.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function public.valid_macro_targets(value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when value is null then true
    when jsonb_typeof(value) <> 'object' then false
    when not (value ?& array['caloriesKcal','proteinG','carbsG','fatG']) then false
    else (select count(*) = 4 and bool_and(case when jsonb_typeof(v) = 'number'
      then (v::text)::numeric between 0 and 20000 and (k <> 'caloriesKcal' or (v::text)::numeric > 0) else false end) from jsonb_each(value) x(k,v)) end;
$$;
revoke all on function public.valid_macro_targets(jsonb) from public, anon;
grant execute on function public.valid_macro_targets(jsonb) to authenticated, service_role;

create or replace function public.valid_training_days(days integer[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(array_ndims(days), 1) = 1 and days <@ array[0,1,2,3,4,5,6]
    and array_position(days, null) is null
    and cardinality(days) = (select count(distinct d) from unnest(days) d);
$$;
revoke all on function public.valid_training_days(integer[]) from public, anon;
grant execute on function public.valid_training_days(integer[]) to authenticated, service_role;

alter table public.users
  add column activity_level text check (activity_level in ('sedentary','light','moderate','high')),
  add column goal text check (goal in ('cut','bulk','maintain')),
  add column training_days integer[] not null default '{}',
  add column training_targets jsonb check (public.valid_macro_targets(training_targets)),
  add column rest_targets jsonb check (public.valid_macro_targets(rest_targets)),
  add column preworkout_fast_carbs boolean not null default false,
  add column preworkout_carbs_g numeric(6,2) not null default 0 check (preworkout_carbs_g between 0 and 300),
  add column preworkout_minutes integer not null default 60 check (preworkout_minutes between 15 and 180),
  add column onboarding_completed_at timestamptz,
  add constraint training_days_valid check (public.valid_training_days(training_days)),
  add constraint onboarding_profile_complete check (onboarding_completed_at is null or
    (height_cm is not null and weight_kg is not null and activity_level is not null and goal is not null
      and (not is_advanced_track or cardinality(training_days) = 4))),
  add constraint preworkout_allocation_valid check (not preworkout_fast_carbs or
    (is_advanced_track and training_targets is not null and preworkout_carbs_g > 0
      and preworkout_carbs_g <= (training_targets->>'carbsG')::numeric));
comment on column public.users.training_days is 'Local weekday numbers, Sunday=0. Advanced track assigns Upper A, Lower A, Upper B, Lower B in Monday-to-Sunday order.';
comment on column public.users.preworkout_carbs_g is 'Allocation within the training-day carbohydrate target, not extra calories.';

-- Keep only the latest report from each voter in the 30-minute window.
-- SECURITY DEFINER is deliberately confined to the unexposed private schema.
create or replace function private.gym_vote_summary()
returns table(location_slug text, vote_count bigint, crowd_score numeric, latest_vote_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return query
    with latest as (
      select distinct on (v.user_id, v.location_slug) v.location_slug, v.status, v.created_at
      from public.gym_busyness_votes v
      where v.created_at > now() - interval '30 minutes' and v.created_at <= now()
      order by v.user_id, v.location_slug, v.created_at desc, v.id desc
    )
    select g.slug, count(l.status), avg(case l.status when 'Quiet' then 0 when 'Normal' then 50 when 'Packed' then 100 end), max(l.created_at)
    from public.gym_locations g left join latest l on l.location_slug = g.slug group by g.slug;
end;
$$;
revoke all on function private.gym_vote_summary() from public, anon, authenticated;
grant execute on function private.gym_vote_summary() to authenticated;
create or replace function public.get_gym_busyness()
returns table(location_slug text, vote_count bigint, crowd_score numeric, latest_vote_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from private.gym_vote_summary(); $$;
revoke all on function public.get_gym_busyness() from public, anon;
grant execute on function public.get_gym_busyness() to authenticated;
commit;
begin;
-- Lightweight anonymous DB probe; it returns no application records.
create or replace function public.service_health() returns boolean
language sql stable security invoker set search_path = '' as $$ select true; $$;
revoke all on function public.service_health() from public;
grant execute on function public.service_health() to anon, authenticated, service_role;

create table private.nutrition_mutation_receipts (
  user_id uuid not null references public.users(id) on delete cascade,
  mutation_id uuid not null,
  log_date date not null,
  payload jsonb not null,
  applied_at timestamptz not null default now(),
  primary key(user_id, mutation_id)
);
alter table private.nutrition_mutation_receipts enable row level security;
revoke all on private.nutrition_mutation_receipts from public, anon, authenticated;
grant select, insert on private.nutrition_mutation_receipts to authenticated;
create policy own_receipts_read on private.nutrition_mutation_receipts for select to authenticated using ((select auth.uid()) = user_id);
create policy own_receipts_insert on private.nutrition_mutation_receipts for insert to authenticated with check ((select auth.uid()) = user_id);
-- Keep receipts for the life of the account: pruning them permits old offline retries to duplicate intake.
create or replace function public.apply_nutrition_mutation(p_id uuid, p_date date, p_macros jsonb, p_micros jsonb, p_patch jsonb)
returns public.daily_nutrition_logs language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := (select auth.uid());
  current_day public.daily_nutrition_logs;
  receipt private.nutrition_mutation_receipts;
  item record;
  merged_micros jsonb;
  payload jsonb := jsonb_build_object('macros',p_macros,'micros',p_micros,'patch',p_patch);
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or p_date is null or p_date < date '2000-01-01' or p_date > current_date + 1 then raise exception 'Invalid diary date' using errcode = '22023'; end if;
  if p_macros is null or jsonb_typeof(p_macros) <> 'object' or not(p_macros ?& array['caloriesKcal','proteinG','carbsG','fatG'])
    or (select count(*) from jsonb_object_keys(p_macros)) <> 4
    or p_micros is null or jsonb_typeof(p_micros) <> 'object' or p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Invalid mutation' using errcode = '22023';
  end if;
  for item in select key,value from jsonb_each(p_macros) loop
    if jsonb_typeof(item.value) <> 'number' or abs((item.value::text)::numeric) > 20000 then raise exception 'Invalid macro delta' using errcode = '22023'; end if;
  end loop;
  for item in select key,value from jsonb_each(p_micros) loop
    if not exists(select 1 from public.nutrient_definitions where key = item.key)
      or jsonb_typeof(item.value) <> 'number' or abs((item.value::text)::numeric) > 1000000000 then raise exception 'Invalid nutrient delta' using errcode = '22023'; end if;
  end loop;
  if (p_patch - 'bodyWeightKg' - 'isAdherent') <> '{}'::jsonb
    or (p_patch ? 'isAdherent' and jsonb_typeof(p_patch->'isAdherent') <> 'boolean')
    or (p_patch ? 'bodyWeightKg' and jsonb_typeof(p_patch->'bodyWeightKg') not in ('number','null')) then
    raise exception 'Invalid diary fields' using errcode = '22023';
  end if;
  insert into public.users(id) values(owner_id) on conflict(id) do nothing;
  insert into public.daily_nutrition_logs(user_id,log_date,calories_kcal,protein_g,carbs_g,fat_g)
    values(owner_id,p_date,0,0,0,0) on conflict(user_id,log_date) do nothing;
  select * into current_day from public.daily_nutrition_logs where user_id = owner_id and log_date = p_date for update;
  select * into receipt from private.nutrition_mutation_receipts where user_id = owner_id and mutation_id = p_id;
  if found then
    if receipt.log_date <> p_date or receipt.payload <> payload then raise exception 'Mutation ID reused' using errcode = '22023'; end if;
    return current_day;
  end if;
  if current_day.calories_kcal is null or current_day.protein_g is null or current_day.carbs_g is null or current_day.fat_g is null then
    raise exception 'Existing diary requires review' using errcode = '23514';
  end if;
  merged_micros := current_day.micronutrients;
  for item in select key,value from jsonb_each(p_micros) loop
    merged_micros := jsonb_set(merged_micros, array[item.key], to_jsonb(coalesce((merged_micros->>item.key)::numeric,0) + (item.value::text)::numeric));
  end loop;
  -- Additions from independent devices commute; manual field edits use server arrival order.
  update public.daily_nutrition_logs set
    calories_kcal = calories_kcal + (p_macros->>'caloriesKcal')::numeric,
    protein_g = protein_g + (p_macros->>'proteinG')::numeric,
    carbs_g = carbs_g + (p_macros->>'carbsG')::numeric,
    fat_g = fat_g + (p_macros->>'fatG')::numeric,
    micronutrients = merged_micros,
    body_weight_kg = case when p_patch ? 'bodyWeightKg' then (p_patch->>'bodyWeightKg')::numeric else body_weight_kg end,
    is_adherent = case when p_patch ? 'isAdherent' then (p_patch->>'isAdherent')::boolean else is_adherent end
    where user_id = owner_id and log_date = p_date returning * into current_day;
  insert into private.nutrition_mutation_receipts(user_id, mutation_id, log_date, payload) values(owner_id,p_id,p_date,payload);
  return current_day;
end;
$$;
revoke all on function public.apply_nutrition_mutation(uuid,date,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.apply_nutrition_mutation(uuid,date,jsonb,jsonb,jsonb) to authenticated;
commit;

begin;
-- Existing personal profile fields remain in users. This extension isolates device registrations.
create table public.profiles (
  id uuid primary key references public.users(id) on delete cascade,
  push_tokens jsonb not null default '{}'::jsonb check (jsonb_typeof(push_tokens) = 'object' and pg_column_size(push_tokens) < 65536)
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
create policy own_notification_profile on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace function public.set_push_installation(p_owner uuid, p_installation uuid, p_registration jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := (select auth.uid()); current_tokens jsonb;
begin
  if owner_id is null or p_owner is distinct from owner_id then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_installation is null then raise exception 'Installation required' using errcode = '22023'; end if;
  if p_registration is not null and (
    jsonb_typeof(p_registration) <> 'object' or
    not (p_registration ?& array['native_token','expo_token','platform','gym_alerts','threshold','time_zone']) or
    jsonb_typeof(p_registration->'native_token') <> 'string' or length(p_registration->>'native_token') not between 1 and 4096 or
    jsonb_typeof(p_registration->'expo_token') <> 'string' or length(p_registration->>'expo_token') not between 1 and 512 or
    jsonb_typeof(p_registration->'platform') <> 'string' or p_registration->>'platform' not in ('ios','android') or jsonb_typeof(p_registration->'gym_alerts') <> 'boolean' or
    jsonb_typeof(p_registration->'threshold') <> 'number' or (p_registration->>'threshold')::numeric not between 5 and 95 or
    jsonb_typeof(p_registration->'time_zone') <> 'string' or not exists(select 1 from pg_catalog.pg_timezone_names where name = p_registration->>'time_zone')
  ) then raise exception 'Invalid push registration' using errcode = '22023'; end if;
  insert into public.profiles(id) values(owner_id) on conflict(id) do nothing;
  select push_tokens into current_tokens from public.profiles where id = owner_id for update;
  if p_registration is null then current_tokens := current_tokens - p_installation::text;
  else
    if not(current_tokens ? p_installation::text) and (select count(*) from jsonb_object_keys(current_tokens)) >= 12 then raise exception 'Too many installations' using errcode = '22023'; end if;
    current_tokens := jsonb_set(current_tokens, array[p_installation::text], jsonb_build_object(
      'native_token',p_registration->'native_token','expo_token',p_registration->'expo_token','platform',p_registration->'platform',
      'gym_alerts',p_registration->'gym_alerts','threshold',p_registration->'threshold','time_zone',p_registration->'time_zone',
      'last_seen',now(),'expires_at',now() + interval '30 days'));
  end if;
  update public.profiles set push_tokens = current_tokens where id = owner_id;
end $$;
revoke all on function public.set_push_installation(uuid,uuid,jsonb) from public, anon;
grant execute on function public.set_push_installation(uuid,uuid,jsonb) to authenticated;

create table public.daily_activity_snapshots (
  user_id uuid not null references public.users(id) on delete cascade,
  activity_date date not null,
  source text not null check (source in ('healthkit','health-connect')),
  steps integer check (steps between 0 and 250000),
  active_energy_kcal numeric(10,3) check (active_energy_kcal between 0 and 50000),
  observed_at timestamptz not null,
  primary key(user_id, activity_date, source)
);
alter table public.daily_activity_snapshots enable row level security;
revoke all on public.daily_activity_snapshots from public, anon, authenticated;
grant select, insert, update, delete on public.daily_activity_snapshots to authenticated;
grant all on public.daily_activity_snapshots to service_role;
create policy own_activity on public.daily_activity_snapshots for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create or replace function public.save_activity_snapshot(p_owner uuid, p_date date, p_source text, p_steps integer, p_energy numeric, p_observed_at timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_owner is distinct from (select auth.uid()) then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_date is null or p_date < date '2000-01-01' or p_date > current_date + 1 or p_observed_at is null or p_observed_at > now() + interval '5 minutes' then raise exception 'Invalid observation' using errcode = '22023'; end if;
  insert into public.daily_activity_snapshots(user_id,activity_date,source,steps,active_energy_kcal,observed_at)
  values((select auth.uid()),p_date,p_source,p_steps,p_energy,p_observed_at)
  on conflict(user_id,activity_date,source) do update set steps=excluded.steps,active_energy_kcal=excluded.active_energy_kcal,observed_at=excluded.observed_at
  where excluded.observed_at > public.daily_activity_snapshots.observed_at;
end $$;
revoke all on function public.save_activity_snapshot(uuid,date,text,integer,numeric,timestamptz) from public, anon;
grant execute on function public.save_activity_snapshot(uuid,date,text,integer,numeric,timestamptz) to authenticated;

-- Service-only threshold latch and delivery receipt state. Clients cannot trigger sends.
create table public.campus_alert_state (
  user_id uuid not null references public.users(id) on delete cascade,
  installation_id uuid not null,
  gym_slug text not null references public.gym_locations(slug),
  below_threshold boolean not null default false,
  checked_at timestamptz not null default now(),
  ticket_id text,
  expo_token text,
  ticket_created_at timestamptz,
  last_alert_at timestamptz,
  receipt_checked boolean not null default true,
  primary key(user_id, installation_id, gym_slug)
);
alter table public.campus_alert_state enable row level security;
revoke all on public.campus_alert_state from public, anon, authenticated;
grant all on public.campus_alert_state to service_role;
create or replace function public.claim_campus_alert(p_user uuid,p_installation uuid,p_gym text,p_below boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare previous public.campus_alert_state; send boolean;
begin
  insert into public.campus_alert_state(user_id,installation_id,gym_slug) values(p_user,p_installation,p_gym) on conflict do nothing;
  select * into previous from public.campus_alert_state where user_id=p_user and installation_id=p_installation and gym_slug=p_gym for update;
  send := p_below and not previous.below_threshold and (previous.last_alert_at is null or previous.last_alert_at < now() - interval '4 hours');
  update public.campus_alert_state set below_threshold=p_below,checked_at=now(),last_alert_at=case when send then now() else last_alert_at end where user_id=p_user and installation_id=p_installation and gym_slug=p_gym;
  return send;
end $$;
revoke all on function public.claim_campus_alert(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.claim_campus_alert(uuid,uuid,text,boolean) to service_role;
create or replace function public.remove_invalid_push_token(p_user uuid,p_installation uuid,p_token text)
returns void language sql security invoker set search_path = '' as $$
  update public.profiles set push_tokens=push_tokens-p_installation::text where id=p_user and push_tokens->p_installation::text->>'expo_token'=p_token;
$$;
revoke all on function public.remove_invalid_push_token(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.remove_invalid_push_token(uuid,uuid,text) to service_role;
create index pending_campus_receipts on public.campus_alert_state(ticket_created_at) where not receipt_checked;
commit;
begin;
create table public.user_feedback (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null check (category in ('bug','feature','other')),
  message text not null check (char_length(btrim(message)) between 10 and 4000),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 2048),
  created_at timestamptz not null default now()
);
create index user_feedback_user_created on public.user_feedback(user_id, created_at desc);
alter table public.user_feedback enable row level security;
revoke all on public.user_feedback from public, anon, authenticated;
grant select, insert on public.user_feedback to authenticated;
grant all on public.user_feedback to service_role;
create policy read_own_feedback on public.user_feedback for select to authenticated using ((select auth.uid()) = user_id);
create policy submit_own_feedback on public.user_feedback for insert to authenticated with check ((select auth.uid()) = user_id);
-- Every insert, including direct Data API writes, shares one per-user rate limit.
create function public.validate_feedback_insert() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 7));
  if exists(select 1 from public.user_feedback where id = new.id and user_id = new.user_id) then return null; end if;
  if (select count(*) from public.user_feedback where user_id = new.user_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Daily feedback limit reached' using errcode = 'P0001';
  end if;
  if exists(select 1 from jsonb_each(new.context) as kv where kv.key not in ('os','os_version','app_version','build','update_id','runtime','channel') or jsonb_typeof(kv.value) <> 'string' or char_length(kv.value #>> '{}') > 160) then
    raise exception 'Invalid device context' using errcode = '22023';
  end if;
  new.created_at := now(); return new;
end $$;
revoke all on function public.validate_feedback_insert() from public, anon, authenticated;
create trigger feedback_validation before insert on public.user_feedback for each row execute function public.validate_feedback_insert();
create function public.submit_feedback(p_owner uuid, p_id uuid, p_category text, p_message text, p_context jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare previous public.user_feedback;
begin
  if (select auth.uid()) is null or p_owner is distinct from (select auth.uid()) then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text, 7));
  select * into previous from public.user_feedback where id = p_id;
  if found then
    if previous.category <> p_category or previous.message <> btrim(p_message) or previous.context <> p_context then raise exception 'Submission changed' using errcode = '22023'; end if;
    return p_id;
  end if;
  insert into public.user_feedback(id,user_id,category,message,context) values(p_id,p_owner,p_category,btrim(p_message),p_context);
  return p_id;
end $$;
revoke all on function public.submit_feedback(uuid,uuid,text,text,jsonb) from public, anon;
grant execute on function public.submit_feedback(uuid,uuid,text,text,jsonb) to authenticated;
-- Auth user deletion cascades through users and all owned application tables.
-- This flag prevents new provider work while the backend completes deletion.
alter table public.users add column deletion_requested_at timestamptz;
revoke delete on public.users from authenticated;
create function public.protect_deletion_flag() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') and new.deletion_requested_at is distinct from old.deletion_requested_at then raise exception 'Deletion state is server-managed' using errcode = '42501'; end if;
  return new;
end $$;
revoke all on function public.protect_deletion_flag() from public, anon, authenticated;
create trigger protect_deletion_flag before update on public.users for each row execute function public.protect_deletion_flag();
create function public.account_accepts_requests() returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.users where id = (select auth.uid()) and deletion_requested_at is null);
$$;
revoke all on function public.account_accepts_requests() from public, anon;
grant execute on function public.account_accepts_requests() to authenticated;
commit;
begin;
-- Shared catalogue rows only: existing ownership and RLS policies are unchanged.
insert into public.exercises(id,name,movement_pattern,equipment,primary_muscle,grip_orientation,body_position) values
('10000000-0000-4000-8000-000000000003','Dumbbell Bench Press','horizontal_push','dumbbell','chest','neutral','supine'),
('10000000-0000-4000-8000-000000000004','High-Bar Back Squat','squat','barbell','quadriceps','pronated','standing'),
('10000000-0000-4000-8000-000000000005','Romanian Deadlift','hinge','barbell','hamstrings','pronated','standing'),
('10000000-0000-4000-8000-000000000006','Seated Dumbbell Shoulder Press','vertical_push','dumbbell','shoulders','neutral','seated'),
('10000000-0000-4000-8000-000000000007','Seated Leg Curl','knee_flexion','machine','hamstrings','neutral','seated'),
('10000000-0000-4000-8000-000000000008','Standing Calf Raise','plantar_flexion','machine','calves','neutral','standing')
on conflict(id) do nothing;
commit;

-- Phase 9: lifestyle budgets and custom routines.
begin;
-- Existing physical measurements remain metric at the database boundary so older binaries coexist.
alter table public.users add column lifestyle_survey jsonb;
alter table public.users add constraint users_lifestyle_survey_object check (lifestyle_survey is null or (jsonb_typeof(lifestyle_survey) = 'object' and octet_length(lifestyle_survey::text) <= 4096));

insert into public.gym_locations(slug,name) values ('livingston','Livingston Recreation Center') on conflict (slug) do nothing;

create table public.workout_routines (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  exercise_ids uuid[] not null check (cardinality(exercise_ids) between 1 and 30),
  created_at timestamptz not null default now(),
  exercise_plan jsonb check (exercise_plan is null or (jsonb_typeof(exercise_plan) = 'array' and jsonb_array_length(exercise_plan) between 1 and 30)),
  times_per_week smallint check (times_per_week is null or times_per_week between 1 and 7)
);
create index workout_routines_owner_idx on public.workout_routines(user_id);
alter table public.workout_routines enable row level security;
revoke all on public.workout_routines from public, anon, authenticated;
grant select, insert, update, delete on public.workout_routines to authenticated;
grant all on public.workout_routines to service_role;
create policy routines_select on public.workout_routines for select to authenticated using (user_id = (select auth.uid()));
create policy routines_insert on public.workout_routines for insert to authenticated with check (user_id = (select auth.uid()));
create policy routines_update on public.workout_routines for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy routines_delete on public.workout_routines for delete to authenticated using (user_id = (select auth.uid()));
-- Invoker visibility prevents referencing another user's private exercise.
create function public.validate_routine_exercises() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (select count(*) from public.exercises where id = any(new.exercise_ids) and not is_archived) <> cardinality(new.exercise_ids) then
    raise exception 'Routine exercises must be distinct, active and accessible' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_routine_exercises() from public, anon, authenticated;
create trigger routine_exercises_check before insert on public.workout_routines for each row execute function public.validate_routine_exercises();

-- Individual logged foods. daily_nutrition_logs stays the authoritative aggregate;
-- these rows exist so a diary can be read back, corrected and deleted.
create table public.food_entries (
  id text primary key check (length(id) between 1 and 128),
  user_id uuid not null references public.users(id) on delete cascade,
  log_date date not null,
  meal text not null check (meal in ('breakfast','lunch','dinner','snack')),
  name text not null check (length(trim(name)) between 1 and 150),
  servings numeric not null check (servings > 0 and servings <= 100),
  serving_label text check (serving_label is null or length(serving_label) <= 80),
  source text not null check (source in ('dining','barcode','photo','manual','custom','recipe','quick')),
  calories_kcal numeric not null check (calories_kcal >= 0 and calories_kcal <= 100000),
  protein_g numeric not null check (protein_g >= 0 and protein_g <= 100000),
  carbs_g numeric not null check (carbs_g >= 0 and carbs_g <= 100000),
  fat_g numeric not null check (fat_g >= 0 and fat_g <= 100000),
  micronutrients jsonb not null default '{}'::jsonb,
  reference_macros jsonb not null default '{}'::jsonb,
  reference_micros jsonb not null default '{}'::jsonb,
  logged_at timestamptz not null default now()
);
create index food_entries_owner_day_idx on public.food_entries(user_id, log_date);
alter table public.food_entries enable row level security;
revoke all on public.food_entries from public, anon, authenticated;
grant select, insert, update, delete on public.food_entries to authenticated;
grant all on public.food_entries to service_role;
create policy food_entries_select on public.food_entries for select to authenticated using (user_id = (select auth.uid()));
create policy food_entries_insert on public.food_entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy food_entries_update on public.food_entries for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy food_entries_delete on public.food_entries for delete to authenticated using (user_id = (select auth.uid()));

-- Circumference and body-composition tracking. Weight alone is a poor progress
-- signal during recomposition; every column is optional and unreported stays null.
create table public.body_measurements (
  id text primary key check (length(id) between 1 and 128),
  user_id uuid not null references public.users(id) on delete cascade,
  measured_on date not null,
  waist_in numeric check (waist_in is null or (waist_in > 0 and waist_in <= 100)),
  hips_in numeric check (hips_in is null or (hips_in > 0 and hips_in <= 100)),
  chest_in numeric check (chest_in is null or (chest_in > 0 and chest_in <= 100)),
  arm_in numeric check (arm_in is null or (arm_in > 0 and arm_in <= 40)),
  thigh_in numeric check (thigh_in is null or (thigh_in > 0 and thigh_in <= 60)),
  body_fat_percent numeric check (body_fat_percent is null or (body_fat_percent >= 0 and body_fat_percent <= 80)),
  note text check (note is null or length(note) <= 280),
  recorded_at timestamptz not null default now(),
  unique (user_id, measured_on)
);
create index body_measurements_owner_idx on public.body_measurements(user_id, measured_on);
alter table public.body_measurements enable row level security;
revoke all on public.body_measurements from public, anon, authenticated;
grant select, insert, update, delete on public.body_measurements to authenticated;
grant all on public.body_measurements to service_role;
create policy body_measurements_select on public.body_measurements for select to authenticated using (user_id = (select auth.uid()));
create policy body_measurements_insert on public.body_measurements for insert to authenticated with check (user_id = (select auth.uid()));
create policy body_measurements_update on public.body_measurements for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy body_measurements_delete on public.body_measurements for delete to authenticated using (user_id = (select auth.uid()));

insert into public.exercises(id,name,movement_pattern,equipment,primary_muscle,variation_notes) values
('10000000-0000-4000-8000-000000000009','Barbell Bench Press','horizontal_push','barbell','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. '),
('10000000-0000-4000-8000-000000000010','Incline Barbell Bench Press','horizontal_push','barbell','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. Use a low incline so the shoulder stays comfortable.'),
('10000000-0000-4000-8000-000000000011','Incline Dumbbell Press','horizontal_push','dumbbell','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. Use a low incline so the shoulder stays comfortable.'),
('10000000-0000-4000-8000-000000000012','Dumbbell Floor Press','horizontal_push','dumbbell','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. '),
('10000000-0000-4000-8000-000000000013','Close-Grip Bench Press','horizontal_push','free weight','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. '),
('10000000-0000-4000-8000-000000000014','Smith Machine Bench Press','horizontal_push','machine','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. '),
('10000000-0000-4000-8000-000000000015','Machine Chest Press','horizontal_push','machine','chest','Lie on a stable bench with feet supported. Lower toward the chest with forearms under the load, then press upward without bouncing. '),
('10000000-0000-4000-8000-000000000016','Push-Up','horizontal_push','bodyweight','chest','Brace your trunk in a straight line. Bend the elbows to lower your chest, then push the support away while keeping hips aligned. '),
('10000000-0000-4000-8000-000000000017','Incline Push-Up','horizontal_push','bodyweight','chest','Brace your trunk in a straight line. Bend the elbows to lower your chest, then push the support away while keeping hips aligned. Use a low incline so the shoulder stays comfortable.'),
('10000000-0000-4000-8000-000000000018','Knee Push-Up','horizontal_push','bodyweight','chest','Brace your trunk in a straight line. Bend the elbows to lower your chest, then push the support away while keeping hips aligned. Support the knees on the floor.'),
('10000000-0000-4000-8000-000000000019','Close-Grip Push-Up','horizontal_push','bodyweight','chest','Brace your trunk in a straight line. Bend the elbows to lower your chest, then push the support away while keeping hips aligned. '),
('10000000-0000-4000-8000-000000000020','Cable Chest Fly','horizontal_adduction','cable','chest','Maintain a soft elbow bend. Bring the arms together in front of the chest, then open under control without forcing the shoulder backward. '),
('10000000-0000-4000-8000-000000000021','Low-to-High Cable Fly','horizontal_adduction','cable','chest','Maintain a soft elbow bend. Bring the arms together in front of the chest, then open under control without forcing the shoulder backward. '),
('10000000-0000-4000-8000-000000000022','Pec Deck Fly','horizontal_adduction','machine','chest','Maintain a soft elbow bend. Bring the arms together in front of the chest, then open under control without forcing the shoulder backward. '),
('10000000-0000-4000-8000-000000000023','Dumbbell Fly','horizontal_adduction','dumbbell','chest','Maintain a soft elbow bend. Bring the arms together in front of the chest, then open under control without forcing the shoulder backward. '),
('10000000-0000-4000-8000-000000000024','Barbell Bent-Over Row','horizontal_pull','barbell','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. '),
('10000000-0000-4000-8000-000000000025','Chest-Supported Dumbbell Row','horizontal_pull','dumbbell','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. '),
('10000000-0000-4000-8000-000000000026','Single-Arm Dumbbell Row','horizontal_pull','dumbbell','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000027','Seated Cable Row','horizontal_pull','cable','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. '),
('10000000-0000-4000-8000-000000000028','T-Bar Row','horizontal_pull','free weight','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. '),
('10000000-0000-4000-8000-000000000029','Inverted Row','horizontal_pull','bodyweight','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. '),
('10000000-0000-4000-8000-000000000030','Single-Arm Cable Row','horizontal_pull','cable','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000031','Machine Row','horizontal_pull','machine','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. '),
('10000000-0000-4000-8000-000000000032','Wide-Grip Lat Pulldown','vertical_pull','free weight','lats','Secure the thighs under the pad. Pull the elbows down toward your sides and bring the handle toward the upper chest; return overhead without swinging. '),
('10000000-0000-4000-8000-000000000033','Supinated Lat Pulldown','vertical_pull','free weight','lats','Secure the thighs under the pad. Pull the elbows down toward your sides and bring the handle toward the upper chest; return overhead without swinging. Use a palms-toward-you grip.'),
('10000000-0000-4000-8000-000000000034','Single-Arm Cable Pulldown','vertical_pull','cable','lats','Secure the thighs under the pad. Pull the elbows down toward your sides and bring the handle toward the upper chest; return overhead without swinging. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000035','Close-Grip Lat Pulldown','vertical_pull','free weight','lats','Secure the thighs under the pad. Pull the elbows down toward your sides and bring the handle toward the upper chest; return overhead without swinging. '),
('10000000-0000-4000-8000-000000000036','Pull-Up','vertical_pull','bodyweight','lats','Start from a controlled hang with the shoulder girdle engaged. Pull your chest toward the bar, then lower smoothly without kicking. '),
('10000000-0000-4000-8000-000000000037','Chin-Up','vertical_pull','bodyweight','lats','Start from a controlled hang with the shoulder girdle engaged. Pull your chest toward the bar, then lower smoothly without kicking. Use a palms-toward-you grip.'),
('10000000-0000-4000-8000-000000000038','Assisted Pull-Up','vertical_pull','bodyweight','lats','Start from a controlled hang with the shoulder girdle engaged. Pull your chest toward the bar, then lower smoothly without kicking. '),
('10000000-0000-4000-8000-000000000039','Neutral-Grip Pull-Up','vertical_pull','bodyweight','lats','Start from a controlled hang with the shoulder girdle engaged. Pull your chest toward the bar, then lower smoothly without kicking. Keep palms facing each other.'),
('10000000-0000-4000-8000-000000000040','Standing Barbell Overhead Press','vertical_push','barbell','shoulders','Brace the abdomen with ribs over pelvis. Press the weight upward above the shoulders, then lower to shoulder level without arching the lower back. '),
('10000000-0000-4000-8000-000000000041','Standing Dumbbell Press','vertical_push','dumbbell','shoulders','Brace the abdomen with ribs over pelvis. Press the weight upward above the shoulders, then lower to shoulder level without arching the lower back. '),
('10000000-0000-4000-8000-000000000042','Machine Shoulder Press','vertical_push','machine','shoulders','Brace the abdomen with ribs over pelvis. Press the weight upward above the shoulders, then lower to shoulder level without arching the lower back. '),
('10000000-0000-4000-8000-000000000043','Single-Arm Dumbbell Press','vertical_push','dumbbell','shoulders','Brace the abdomen with ribs over pelvis. Press the weight upward above the shoulders, then lower to shoulder level without arching the lower back. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000044','Dumbbell Lateral Raise','shoulder_abduction','dumbbell','shoulders','Keep elbows slightly bent. Raise the arms out to the sides to a comfortable shoulder height, then lower slowly without shrugging or swinging. '),
('10000000-0000-4000-8000-000000000045','Cable Lateral Raise','shoulder_abduction','cable','shoulders','Keep elbows slightly bent. Raise the arms out to the sides to a comfortable shoulder height, then lower slowly without shrugging or swinging. '),
('10000000-0000-4000-8000-000000000046','Machine Lateral Raise','shoulder_abduction','machine','shoulders','Keep elbows slightly bent. Raise the arms out to the sides to a comfortable shoulder height, then lower slowly without shrugging or swinging. '),
('10000000-0000-4000-8000-000000000047','Leaning Cable Lateral Raise','shoulder_abduction','cable','shoulders','Keep elbows slightly bent. Raise the arms out to the sides to a comfortable shoulder height, then lower slowly without shrugging or swinging. '),
('10000000-0000-4000-8000-000000000048','Reverse Pec Deck','horizontal_abduction','free weight','rear_delts','Support or hinge your torso. Move the upper arms outward with a soft elbow bend, then return slowly while keeping the neck relaxed. '),
('10000000-0000-4000-8000-000000000049','Bent-Over Dumbbell Reverse Fly','horizontal_abduction','dumbbell','rear_delts','Support or hinge your torso. Move the upper arms outward with a soft elbow bend, then return slowly while keeping the neck relaxed. '),
('10000000-0000-4000-8000-000000000050','Cable Reverse Fly','horizontal_abduction','cable','rear_delts','Support or hinge your torso. Move the upper arms outward with a soft elbow bend, then return slowly while keeping the neck relaxed. '),
('10000000-0000-4000-8000-000000000051','Front Squat','squat','free weight','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000052','Goblet Squat','squat','free weight','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000053','Hack Squat','squat','free weight','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000054','Smith Machine Squat','squat','machine','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000055','Box Squat','squat','free weight','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000056','Bodyweight Squat','squat','bodyweight','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000057','Safety-Bar Squat','squat','free weight','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. '),
('10000000-0000-4000-8000-000000000058','Leg Press','knee_extension','machine','quadriceps','Sit with hips and back supported. Bend the knees without rolling the pelvis, then press the platform away without locking the knees forcefully. '),
('10000000-0000-4000-8000-000000000059','Single-Leg Press','knee_extension','machine','quadriceps','Sit with hips and back supported. Bend the knees without rolling the pelvis, then press the platform away without locking the knees forcefully. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000060','Horizontal Leg Press','knee_extension','machine','quadriceps','Sit with hips and back supported. Bend the knees without rolling the pelvis, then press the platform away without locking the knees forcefully. '),
('10000000-0000-4000-8000-000000000061','Reverse Lunge','lunge','free weight','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. '),
('10000000-0000-4000-8000-000000000062','Forward Lunge','lunge','free weight','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. '),
('10000000-0000-4000-8000-000000000063','Dumbbell Split Squat','lunge','dumbbell','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. '),
('10000000-0000-4000-8000-000000000064','Bulgarian Split Squat','lunge','free weight','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. Rest the rear foot on a stable low bench.'),
('10000000-0000-4000-8000-000000000065','Walking Lunge','lunge','free weight','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. '),
('10000000-0000-4000-8000-000000000066','Conventional Deadlift','hip_hinge','free weight','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. '),
('10000000-0000-4000-8000-000000000067','Sumo Deadlift','hip_hinge','free weight','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. '),
('10000000-0000-4000-8000-000000000068','Trap-Bar Deadlift','hip_hinge','free weight','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. '),
('10000000-0000-4000-8000-000000000069','Dumbbell Romanian Deadlift','hip_hinge','dumbbell','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. '),
('10000000-0000-4000-8000-000000000070','Single-Leg Romanian Deadlift','hip_hinge','free weight','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000071','Good Morning','hip_hinge','free weight','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. '),
('10000000-0000-4000-8000-000000000072','Cable Pull-Through','hip_hinge','cable','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. '),
('10000000-0000-4000-8000-000000000073','Barbell Hip Thrust','hip_extension','barbell','glutes','Set feet securely with knees bent. Extend the hips by squeezing the glutes, pause with ribs down, then lower without overextending the back. '),
('10000000-0000-4000-8000-000000000074','Glute Bridge','hip_extension','bodyweight','glutes','Set feet securely with knees bent. Extend the hips by squeezing the glutes, pause with ribs down, then lower without overextending the back. '),
('10000000-0000-4000-8000-000000000075','Single-Leg Glute Bridge','hip_extension','bodyweight','glutes','Set feet securely with knees bent. Extend the hips by squeezing the glutes, pause with ribs down, then lower without overextending the back. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000076','Machine Hip Thrust','hip_extension','machine','glutes','Set feet securely with knees bent. Extend the hips by squeezing the glutes, pause with ribs down, then lower without overextending the back. '),
('10000000-0000-4000-8000-000000000077','Lying Leg Curl','knee_flexion','machine','hamstrings','Align the machine axis with the knee. Keep hips supported as you curl the pad toward the body, then straighten the knee slowly. '),
('10000000-0000-4000-8000-000000000078','Standing Single-Leg Curl','knee_flexion','machine','hamstrings','Align the machine axis with the knee. Keep hips supported as you curl the pad toward the body, then straighten the knee slowly. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000079','Leg Extension','knee_extension','machine','quadriceps','Align the knee with the machine pivot and keep the thigh supported. Straighten the knee smoothly against the pad, then lower under control. '),
('10000000-0000-4000-8000-000000000080','Single-Leg Extension','knee_extension','machine','quadriceps','Align the knee with the machine pivot and keep the thigh supported. Straighten the knee smoothly against the pad, then lower under control. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000081','Seated Calf Raise','plantar_flexion','free weight','calves','Keep the ball of the foot supported. Lift the heel through a comfortable range, pause, and lower slowly without bouncing. '),
('10000000-0000-4000-8000-000000000082','Leg Press Calf Raise','plantar_flexion','free weight','calves','Keep the ball of the foot supported. Lift the heel through a comfortable range, pause, and lower slowly without bouncing. '),
('10000000-0000-4000-8000-000000000083','Single-Leg Calf Raise','plantar_flexion','free weight','calves','Keep the ball of the foot supported. Lift the heel through a comfortable range, pause, and lower slowly without bouncing. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000084','Barbell Curl','elbow_flexion','barbell','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. '),
('10000000-0000-4000-8000-000000000085','Dumbbell Curl','elbow_flexion','dumbbell','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. '),
('10000000-0000-4000-8000-000000000086','Hammer Curl','elbow_flexion','free weight','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. Keep palms facing each other.'),
('10000000-0000-4000-8000-000000000087','Preacher Curl','elbow_flexion','free weight','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. '),
('10000000-0000-4000-8000-000000000088','Incline Dumbbell Curl','elbow_flexion','dumbbell','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. Use a low incline so the shoulder stays comfortable.'),
('10000000-0000-4000-8000-000000000089','Cable Curl','elbow_flexion','cable','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. '),
('10000000-0000-4000-8000-000000000090','Concentration Curl','elbow_flexion','free weight','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. '),
('10000000-0000-4000-8000-000000000091','EZ-Bar Curl','elbow_flexion','free weight','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. '),
('10000000-0000-4000-8000-000000000092','Reverse Curl','elbow_flexion','free weight','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. Use a palms-away grip.'),
('10000000-0000-4000-8000-000000000093','Cable Triceps Pushdown','elbow_extension','cable','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. '),
('10000000-0000-4000-8000-000000000094','Rope Triceps Pushdown','elbow_extension','free weight','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. '),
('10000000-0000-4000-8000-000000000095','Overhead Cable Triceps Extension','elbow_extension','cable','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. '),
('10000000-0000-4000-8000-000000000096','Dumbbell Overhead Extension','elbow_extension','dumbbell','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. '),
('10000000-0000-4000-8000-000000000097','Lying EZ-Bar Triceps Extension','elbow_extension','free weight','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. '),
('10000000-0000-4000-8000-000000000098','Single-Arm Cable Pushdown','elbow_extension','cable','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. Train each side separately and keep the pelvis level.'),
('10000000-0000-4000-8000-000000000099','Cable Crunch','trunk_flexion','cable','abdominals','Keep the pelvis controlled. Bring the rib cage toward the pelvis with a small trunk curl, then return slowly without pulling on the neck. '),
('10000000-0000-4000-8000-000000000100','Floor Crunch','trunk_flexion','bodyweight','abdominals','Keep the pelvis controlled. Bring the rib cage toward the pelvis with a small trunk curl, then return slowly without pulling on the neck. '),
('10000000-0000-4000-8000-000000000101','Machine Ab Crunch','trunk_flexion','machine','abdominals','Keep the pelvis controlled. Bring the rib cage toward the pelvis with a small trunk curl, then return slowly without pulling on the neck. ')
on conflict (id) do nothing;

-- Account deletion no longer depends on a service-role backend being reachable.
-- The identity delete cascades through public.users to every application row.
-- Where the migration role may not remove an auth identity, the account's data is
-- still erased and the caller is told the sign-in itself survived, so the UI can
-- say so rather than reporting a success that did not happen.
create or replace function private.delete_own_account()
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  begin
    delete from auth.users where id = owner_id;
    return true;
  exception when insufficient_privilege then
    -- The savepoint rolls the attempt back; nothing partial survives it.
    null;
  end;
  delete from public.users where id = owner_id;
  return false;
end;
$$;
revoke all on function private.delete_own_account() from public, anon, authenticated;
grant execute on function private.delete_own_account() to authenticated;

create or replace function public.delete_own_account()
returns boolean language sql volatile security invoker set search_path = '' as $$ select private.delete_own_account(); $$;
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- Busyness forecast built from the reports students have already submitted, so the
-- feature stands on its own when no paid forecast provider is configured. Votes are
-- bucketed by Eastern weekday and hour; only the aggregate leaves the function.
create or replace function private.gym_hour_forecast()
returns table(location_slug text, forecast_score numeric, sample_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  local_now timestamp := (now() at time zone 'America/New_York');
  target_dow int := extract(dow from local_now)::int;
  target_hour int := extract(hour from local_now)::int;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return query
    with scored as (
      select v.location_slug as slug,
        case v.status when 'Quiet' then 0 when 'Normal' then 50 else 100 end as score,
        extract(dow from (v.created_at at time zone 'America/New_York'))::int as dow,
        extract(hour from (v.created_at at time zone 'America/New_York'))::int as hour
      from public.gym_busyness_votes v
      where v.created_at > now() - interval '120 days' and v.created_at <= now()
    ),
    -- The hour either side of now is included so a quiet slot still has a sample.
    matched as (
      select s.slug, s.score from scored s
      where s.dow = target_dow and least((s.hour - target_hour + 24) % 24, (target_hour - s.hour + 24) % 24) <= 1
    )
    select g.slug, round(avg(m.score), 0), count(m.score)
    from public.gym_locations g left join matched m on m.slug = g.slug group by g.slug;
end;
$$;
revoke all on function private.gym_hour_forecast() from public, anon, authenticated;
grant execute on function private.gym_hour_forecast() to authenticated;

create or replace function public.get_gym_forecast()
returns table(location_slug text, forecast_score numeric, sample_count bigint)
language sql stable security invoker set search_path = '' as $$ select * from private.gym_hour_forecast(); $$;
revoke all on function public.get_gym_forecast() from public, anon;
grant execute on function public.get_gym_forecast() to authenticated;

-- Catalogue expansion. Kept identical to the phase 13 catalogue migration so a bootstrapped
-- database and a migrated one hold the same exercise rows.
insert into public.exercises(id,name,movement_pattern,equipment,primary_muscle,variation_notes) values
  ('10000000-0000-4000-8000-000000000102','Barbell Floor Press','horizontal_push','barbell','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing.'),
  ('10000000-0000-4000-8000-000000000103','Larsen Press','horizontal_push','barbell','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing. Pause for a full second at the hardest point of each rep.'),
  ('10000000-0000-4000-8000-000000000104','Paused Barbell Bench Press','horizontal_push','barbell','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing. Pause for a full second at the hardest point of each rep.'),
  ('10000000-0000-4000-8000-000000000105','Incline Smith Machine Press','horizontal_push','machine','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing. Use a low incline so the shoulder stays comfortable.'),
  ('10000000-0000-4000-8000-000000000106','Decline Barbell Bench Press','horizontal_push','barbell','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing. A slight decline keeps tension on the lower chest.'),
  ('10000000-0000-4000-8000-000000000107','Decline Dumbbell Press','horizontal_push','dumbbell','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing. A slight decline keeps tension on the lower chest.'),
  ('10000000-0000-4000-8000-000000000108','Guillotine Press','horizontal_push','barbell','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing. Take three seconds to lower every rep.'),
  ('10000000-0000-4000-8000-000000000109','Seated Cable Chest Press','horizontal_push','cable','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing.'),
  ('10000000-0000-4000-8000-000000000110','Incline Chest Press Machine','horizontal_push','machine','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing. Use a low incline so the shoulder stays comfortable.'),
  ('10000000-0000-4000-8000-000000000111','Single-Arm Machine Chest Press','horizontal_push','machine','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000112','Weighted Push-Up','horizontal_push','bodyweight','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing.'),
  ('10000000-0000-4000-8000-000000000113','Deficit Push-Up','horizontal_push','bodyweight','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing. Let the target muscle reach a full stretch before reversing.'),
  ('10000000-0000-4000-8000-000000000114','Archer Push-Up','horizontal_push','bodyweight','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000115','Ring Push-Up','horizontal_push','bodyweight','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing.'),
  ('10000000-0000-4000-8000-000000000116','Chest Dip','horizontal_push','bodyweight','chest','Set the shoulder blades down and back against a stable surface. Lower the load toward the chest with the forearms stacked under it, then press away without bouncing. Let the target muscle reach a full stretch before reversing.'),
  ('10000000-0000-4000-8000-000000000117','Cable Crossover','horizontal_adduction','cable','chest','Maintain a soft elbow bend. Bring the arms together in front of the chest, then open under control without forcing the shoulder backward.'),
  ('10000000-0000-4000-8000-000000000118','High-to-Low Cable Fly','horizontal_adduction','cable','chest','Maintain a soft elbow bend. Bring the arms together in front of the chest, then open under control without forcing the shoulder backward. A slight decline keeps tension on the lower chest.'),
  ('10000000-0000-4000-8000-000000000119','Single-Arm Cable Fly','horizontal_adduction','cable','chest','Maintain a soft elbow bend. Bring the arms together in front of the chest, then open under control without forcing the shoulder backward. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000120','Incline Dumbbell Fly','horizontal_adduction','dumbbell','chest','Maintain a soft elbow bend. Bring the arms together in front of the chest, then open under control without forcing the shoulder backward. Use a low incline so the shoulder stays comfortable.'),
  ('10000000-0000-4000-8000-000000000121','Machine Fly (Low Setting)','horizontal_adduction','machine','chest','Maintain a soft elbow bend. Bring the arms together in front of the chest, then open under control without forcing the shoulder backward. Use a low incline so the shoulder stays comfortable.'),
  ('10000000-0000-4000-8000-000000000122','Chest-Supported T-Bar Row','horizontal_pull','machine','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. Chest support removes the lower back from the equation.'),
  ('10000000-0000-4000-8000-000000000123','Landmine Row','horizontal_pull','barbell','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control.'),
  ('10000000-0000-4000-8000-000000000124','Pendlay Row','horizontal_pull','barbell','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. Pause for a full second at the hardest point of each rep.'),
  ('10000000-0000-4000-8000-000000000125','Meadows Row','horizontal_pull','barbell','lats','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000126','Helms Row','horizontal_pull','dumbbell','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. Chest support removes the lower back from the equation.'),
  ('10000000-0000-4000-8000-000000000127','Seal Row','horizontal_pull','barbell','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. Chest support removes the lower back from the equation.'),
  ('10000000-0000-4000-8000-000000000128','Feet-Elevated Inverted Row','horizontal_pull','bodyweight','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control.'),
  ('10000000-0000-4000-8000-000000000129','Hammer Strength Row','horizontal_pull','machine','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000130','Wide-Grip Seated Cable Row','horizontal_pull','cable','upper_back','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. Use a palms-away grip.'),
  ('10000000-0000-4000-8000-000000000131','Gorilla Row','horizontal_pull','dumbbell','lats','Brace your trunk and reach without rounding your lower back. Pull the elbows behind you toward the ribs, pause, and extend the arms under control. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000132','Weighted Pull-Up','vertical_pull','bodyweight','lats','Start from a full hang or full stretch overhead. Pull the elbows down toward your sides until the handle or bar reaches the upper chest, then return overhead under control. Use a palms-away grip.'),
  ('10000000-0000-4000-8000-000000000133','Weighted Chin-Up','vertical_pull','bodyweight','lats','Start from a full hang or full stretch overhead. Pull the elbows down toward your sides until the handle or bar reaches the upper chest, then return overhead under control. Use a palms-up grip.'),
  ('10000000-0000-4000-8000-000000000134','Scapular Pull-Up','vertical_pull','bodyweight','lats','Start from a full hang or full stretch overhead. Pull the elbows down toward your sides until the handle or bar reaches the upper chest, then return overhead under control. Let the target muscle reach a full stretch before reversing.'),
  ('10000000-0000-4000-8000-000000000135','Kneeling Lat Pulldown','vertical_pull','cable','lats','Start from a full hang or full stretch overhead. Pull the elbows down toward your sides until the handle or bar reaches the upper chest, then return overhead under control. Use a palms-away grip.'),
  ('10000000-0000-4000-8000-000000000136','Rope Lat Pulldown','vertical_pull','cable','lats','Start from a full hang or full stretch overhead. Pull the elbows down toward your sides until the handle or bar reaches the upper chest, then return overhead under control. Keep palms facing each other.'),
  ('10000000-0000-4000-8000-000000000137','Chest-Supported Machine Pulldown','vertical_pull','machine','lats','Start from a full hang or full stretch overhead. Pull the elbows down toward your sides until the handle or bar reaches the upper chest, then return overhead under control. Chest support removes the lower back from the equation.'),
  ('10000000-0000-4000-8000-000000000138','Straight-Arm Pulldown','vertical_pull','cable','lats','Start from a full hang or full stretch overhead. Pull the elbows down toward your sides until the handle or bar reaches the upper chest, then return overhead under control. Let the target muscle reach a full stretch before reversing.'),
  ('10000000-0000-4000-8000-000000000139','Dumbbell Pullover','vertical_pull','dumbbell','lats','Start from a full hang or full stretch overhead. Pull the elbows down toward your sides until the handle or bar reaches the upper chest, then return overhead under control. Let the target muscle reach a full stretch before reversing.'),
  ('10000000-0000-4000-8000-000000000140','Machine Pullover','vertical_pull','machine','lats','Start from a full hang or full stretch overhead. Pull the elbows down toward your sides until the handle or bar reaches the upper chest, then return overhead under control. Let the target muscle reach a full stretch before reversing.'),
  ('10000000-0000-4000-8000-000000000141','Cable Face Pull','horizontal_abduction','cable','rear_delts','Support or hinge your torso. Move the upper arms outward with a soft elbow bend, then return slowly while keeping the neck relaxed.'),
  ('10000000-0000-4000-8000-000000000142','Band Pull-Apart','horizontal_abduction','bodyweight','rear_delts','Support or hinge your torso. Move the upper arms outward with a soft elbow bend, then return slowly while keeping the neck relaxed. Keep tension on the band at both ends of the rep.'),
  ('10000000-0000-4000-8000-000000000143','Prone Incline Reverse Fly','horizontal_abduction','dumbbell','rear_delts','Support or hinge your torso. Move the upper arms outward with a soft elbow bend, then return slowly while keeping the neck relaxed. Chest support removes the lower back from the equation.'),
  ('10000000-0000-4000-8000-000000000144','Prone Y-Raise','horizontal_abduction','dumbbell','rear_delts','Support or hinge your torso. Move the upper arms outward with a soft elbow bend, then return slowly while keeping the neck relaxed. Chest support removes the lower back from the equation.'),
  ('10000000-0000-4000-8000-000000000145','Barbell Shrug','shoulder_shrug','barbell','traps','Let the arms hang straight and keep the neck relaxed. Lift the shoulders toward the ears, pause at the top, then lower them fully.'),
  ('10000000-0000-4000-8000-000000000146','Dumbbell Shrug','shoulder_shrug','dumbbell','traps','Let the arms hang straight and keep the neck relaxed. Lift the shoulders toward the ears, pause at the top, then lower them fully.'),
  ('10000000-0000-4000-8000-000000000147','Trap Bar Shrug','shoulder_shrug','barbell','traps','Let the arms hang straight and keep the neck relaxed. Lift the shoulders toward the ears, pause at the top, then lower them fully.'),
  ('10000000-0000-4000-8000-000000000148','Cable Shrug','shoulder_shrug','cable','traps','Let the arms hang straight and keep the neck relaxed. Lift the shoulders toward the ears, pause at the top, then lower them fully.'),
  ('10000000-0000-4000-8000-000000000149','Machine Shrug','shoulder_shrug','machine','traps','Let the arms hang straight and keep the neck relaxed. Lift the shoulders toward the ears, pause at the top, then lower them fully.'),
  ('10000000-0000-4000-8000-000000000150','Barbell Overhead Press','vertical_push','barbell','shoulders','Brace the abdomen with ribs over pelvis. Press the weight upward above the shoulders, then lower to shoulder level without arching the lower back.'),
  ('10000000-0000-4000-8000-000000000151','Seated Barbell Overhead Press','vertical_push','barbell','shoulders','Brace the abdomen with ribs over pelvis. Press the weight upward above the shoulders, then lower to shoulder level without arching the lower back.'),
  ('10000000-0000-4000-8000-000000000152','Arnold Press','vertical_push','dumbbell','shoulders','Brace the abdomen with ribs over pelvis. Press the weight upward above the shoulders, then lower to shoulder level without arching the lower back.'),
  ('10000000-0000-4000-8000-000000000153','Smith Machine Shoulder Press','vertical_push','machine','shoulders','Brace the abdomen with ribs over pelvis. Press the weight upward above the shoulders, then lower to shoulder level without arching the lower back.'),
  ('10000000-0000-4000-8000-000000000154','Landmine Press','vertical_push','barbell','shoulders','Brace the abdomen with ribs over pelvis. Press the weight upward above the shoulders, then lower to shoulder level without arching the lower back. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000155','Behind-the-Back Cable Lateral Raise','shoulder_abduction','cable','shoulders','Keep elbows slightly bent. Raise the arms out to the sides to a comfortable shoulder height, then lower slowly without shrugging or swinging. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000156','Wide-Grip Upright Row','shoulder_abduction','barbell','shoulders','Keep elbows slightly bent. Raise the arms out to the sides to a comfortable shoulder height, then lower slowly without shrugging or swinging.'),
  ('10000000-0000-4000-8000-000000000157','Lying Incline Lateral Raise','shoulder_abduction','dumbbell','shoulders','Keep elbows slightly bent. Raise the arms out to the sides to a comfortable shoulder height, then lower slowly without shrugging or swinging. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000158','Front Raise','shoulder_abduction','dumbbell','shoulders','Keep elbows slightly bent. Raise the arms out to the sides to a comfortable shoulder height, then lower slowly without shrugging or swinging.'),
  ('10000000-0000-4000-8000-000000000159','Cable Y-Raise','shoulder_abduction','cable','shoulders','Keep elbows slightly bent. Raise the arms out to the sides to a comfortable shoulder height, then lower slowly without shrugging or swinging.'),
  ('10000000-0000-4000-8000-000000000160','Spider Curl','elbow_flexion','dumbbell','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. Chest support removes the lower back from the equation.'),
  ('10000000-0000-4000-8000-000000000161','Bayesian Cable Curl','elbow_flexion','cable','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. Let the target muscle reach a full stretch before reversing.'),
  ('10000000-0000-4000-8000-000000000162','Machine Preacher Curl','elbow_flexion','machine','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso.'),
  ('10000000-0000-4000-8000-000000000163','Cable Hammer Curl','elbow_flexion','cable','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. Keep palms facing each other.'),
  ('10000000-0000-4000-8000-000000000164','Drag Curl','elbow_flexion','barbell','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. Let the target muscle reach a full stretch before reversing.'),
  ('10000000-0000-4000-8000-000000000165','Zottman Curl','elbow_flexion','dumbbell','biceps','Keep the upper arm still and wrist stacked. Bend the elbow to bring the load up, then lower slowly without swinging the torso. Take three seconds to lower every rep.'),
  ('10000000-0000-4000-8000-000000000166','Tate Press','elbow_extension','dumbbell','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight.'),
  ('10000000-0000-4000-8000-000000000167','Cross-Body Cable Extension','elbow_extension','cable','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000168','Triceps Dip','elbow_extension','bodyweight','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight.'),
  ('10000000-0000-4000-8000-000000000169','Bench Dip','elbow_extension','bodyweight','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight.'),
  ('10000000-0000-4000-8000-000000000170','Machine Triceps Extension','elbow_extension','machine','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight.'),
  ('10000000-0000-4000-8000-000000000171','JM Press','elbow_extension','barbell','triceps','Hold the upper arm steady. Straighten the elbow against resistance, then bend it under control; avoid moving the shoulder to lift the weight. A narrower stance keeps more of the work on the quadriceps.'),
  ('10000000-0000-4000-8000-000000000172','Barbell Wrist Curl','wrist_flexion','barbell','forearms','Support the forearm and let the wrist hang free. Curl the hand upward through a full range, then lower slowly until the stretch is felt. Anchor the feet or hips so only the target joint moves.'),
  ('10000000-0000-4000-8000-000000000173','Dumbbell Wrist Curl','wrist_flexion','dumbbell','forearms','Support the forearm and let the wrist hang free. Curl the hand upward through a full range, then lower slowly until the stretch is felt. Anchor the feet or hips so only the target joint moves.'),
  ('10000000-0000-4000-8000-000000000174','Reverse Wrist Curl','wrist_extension','dumbbell','forearms','Support the forearm with the palm facing down. Lift the back of the hand upward, pause, then lower slowly under control. Anchor the feet or hips so only the target joint moves.'),
  ('10000000-0000-4000-8000-000000000175','Cable Wrist Curl','wrist_flexion','cable','forearms','Support the forearm and let the wrist hang free. Curl the hand upward through a full range, then lower slowly until the stretch is felt. Anchor the feet or hips so only the target joint moves.'),
  ('10000000-0000-4000-8000-000000000176','Farmer Carry','carry','dumbbell','forearms','Stand tall with the ribs down and shoulders set. Walk with short, deliberate steps and no lean, and put the load down before the position degrades.'),
  ('10000000-0000-4000-8000-000000000177','Suitcase Carry','carry','dumbbell','obliques','Stand tall with the ribs down and shoulders set. Walk with short, deliberate steps and no lean, and put the load down before the position degrades. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000178','Anderson Squat','squat','barbell','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. Pause for a full second at the hardest point of each rep.'),
  ('10000000-0000-4000-8000-000000000179','Low-Bar Back Squat','squat','barbell','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. A wider stance shifts more of the work to the hips and inner thigh.'),
  ('10000000-0000-4000-8000-000000000180','Paused Back Squat','squat','barbell','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. Pause for a full second at the hardest point of each rep.'),
  ('10000000-0000-4000-8000-000000000181','Zercher Squat','squat','barbell','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand.'),
  ('10000000-0000-4000-8000-000000000182','V-Squat Machine','squat','machine','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand.'),
  ('10000000-0000-4000-8000-000000000183','Heel-Elevated Goblet Squat','squat','dumbbell','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand. A narrower stance keeps more of the work on the quadriceps.'),
  ('10000000-0000-4000-8000-000000000184','Belt Squat','squat','machine','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand.'),
  ('10000000-0000-4000-8000-000000000185','Pendulum Squat','squat','machine','quadriceps','Brace your trunk. Bend hips and knees together with knees tracking the toes; lower to a controlled depth, then push through the whole foot to stand.'),
  ('10000000-0000-4000-8000-000000000186','Front Foot Elevated Split Squat','lunge','dumbbell','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000187','Feet-High Leg Press','knee_extension','machine','glutes','Align the knee with the machine pivot and keep the thigh supported. Straighten the knee smoothly against the pad, then lower under control. Let the target muscle reach a full stretch before reversing.'),
  ('10000000-0000-4000-8000-000000000188','Narrow-Stance Leg Press','knee_extension','machine','quadriceps','Align the knee with the machine pivot and keep the thigh supported. Straighten the knee smoothly against the pad, then lower under control. A narrower stance keeps more of the work on the quadriceps.'),
  ('10000000-0000-4000-8000-000000000189','Wide-Stance Leg Press','knee_extension','machine','glutes','Align the knee with the machine pivot and keep the thigh supported. Straighten the knee smoothly against the pad, then lower under control. A wider stance shifts more of the work to the hips and inner thigh.'),
  ('10000000-0000-4000-8000-000000000190','Sissy Squat','knee_extension','bodyweight','quadriceps','Align the knee with the machine pivot and keep the thigh supported. Straighten the knee smoothly against the pad, then lower under control. Let the target muscle reach a full stretch before reversing.'),
  ('10000000-0000-4000-8000-000000000191','Deficit Reverse Lunge','lunge','dumbbell','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000192','Curtsy Lunge','lunge','dumbbell','glutes','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000193','Barbell Bulgarian Split Squat','lunge','barbell','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000194','Step-Up','lunge','dumbbell','glutes','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000195','Smith Machine Split Squat','lunge','machine','quadriceps','Use a stable split stance. Lower both knees while keeping the front heel grounded, then press through the front foot to return. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000196','Rack Pull','hip_hinge','barbell','upper_back','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand.'),
  ('10000000-0000-4000-8000-000000000197','Deficit Deadlift','hip_hinge','barbell','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. Standing on a small platform adds range; only use it if the spine stays neutral.'),
  ('10000000-0000-4000-8000-000000000198','Block Pull Deadlift','hip_hinge','barbell','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand.'),
  ('10000000-0000-4000-8000-000000000199','Deficit Romanian Deadlift','hip_hinge','barbell','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. Standing on a small platform adds range; only use it if the spine stays neutral.'),
  ('10000000-0000-4000-8000-000000000200','Snatch-Grip Romanian Deadlift','hip_hinge','barbell','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. Let the target muscle reach a full stretch before reversing.'),
  ('10000000-0000-4000-8000-000000000201','Seated Good Morning','hip_hinge','barbell','hamstrings','Keep the load close and spine neutral. Send the hips back with softly bent knees, then drive through the feet and extend the hips to stand. Anchor the feet or hips so only the target joint moves.'),
  ('10000000-0000-4000-8000-000000000202','Banded Hip Thrust','hip_extension','bodyweight','glutes','Set feet securely with knees bent. Extend the hips by squeezing the glutes, pause with ribs down, then lower without overextending the back. Keep tension on the band at both ends of the rep.'),
  ('10000000-0000-4000-8000-000000000203','Single-Leg Hip Thrust','hip_extension','bodyweight','glutes','Set feet securely with knees bent. Extend the hips by squeezing the glutes, pause with ribs down, then lower without overextending the back. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000204','Back Extension','spinal_extension','bodyweight','lower_back','Hinge from the hips with the spine long. Lift the torso until the body is in one line — no further — then lower with the same control. Chest support removes the lower back from the equation.'),
  ('10000000-0000-4000-8000-000000000205','Weighted Back Extension','spinal_extension','free weight','lower_back','Hinge from the hips with the spine long. Lift the torso until the body is in one line — no further — then lower with the same control. Chest support removes the lower back from the equation.'),
  ('10000000-0000-4000-8000-000000000206','Reverse Hyperextension','spinal_extension','machine','lower_back','Hinge from the hips with the spine long. Lift the torso until the body is in one line — no further — then lower with the same control.'),
  ('10000000-0000-4000-8000-000000000207','Nordic Hamstring Curl','knee_flexion','bodyweight','hamstrings','Align the machine axis with the knee. Keep hips supported as you curl the pad toward the body, then straighten the knee slowly. Take three seconds to lower every rep.'),
  ('10000000-0000-4000-8000-000000000208','Swiss Ball Leg Curl','knee_flexion','bodyweight','hamstrings','Align the machine axis with the knee. Keep hips supported as you curl the pad toward the body, then straighten the knee slowly.'),
  ('10000000-0000-4000-8000-000000000209','Glute-Ham Raise','knee_flexion','bodyweight','hamstrings','Align the machine axis with the knee. Keep hips supported as you curl the pad toward the body, then straighten the knee slowly.'),
  ('10000000-0000-4000-8000-000000000210','Hip Adduction Machine','hip_adduction','machine','adductors','Sit tall with the pelvis supported. Draw the thighs together against the pads, pause, then open slowly to a comfortable stretch.'),
  ('10000000-0000-4000-8000-000000000211','Cable Hip Adduction','hip_adduction','cable','adductors','Sit tall with the pelvis supported. Draw the thighs together against the pads, pause, then open slowly to a comfortable stretch. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000212','Hip Abduction Machine','hip_abduction','machine','abductors','Sit or stand tall without leaning. Drive the thighs apart against the resistance, pause, then return slowly rather than letting them snap back.'),
  ('10000000-0000-4000-8000-000000000213','Cable Hip Abduction','hip_abduction','cable','abductors','Sit or stand tall without leaning. Drive the thighs apart against the resistance, pause, then return slowly rather than letting them snap back. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000214','Banded Lateral Walk','hip_abduction','bodyweight','abductors','Sit or stand tall without leaning. Drive the thighs apart against the resistance, pause, then return slowly rather than letting them snap back. Keep tension on the band at both ends of the rep.'),
  ('10000000-0000-4000-8000-000000000215','Standing Barbell Calf Raise','plantar_flexion','barbell','calves','Keep the ball of the foot supported. Lift the heel through a comfortable range, pause, and lower slowly without bouncing.'),
  ('10000000-0000-4000-8000-000000000216','Smith Machine Calf Raise','plantar_flexion','machine','calves','Keep the ball of the foot supported. Lift the heel through a comfortable range, pause, and lower slowly without bouncing.'),
  ('10000000-0000-4000-8000-000000000217','Donkey Calf Raise','plantar_flexion','machine','calves','Keep the ball of the foot supported. Lift the heel through a comfortable range, pause, and lower slowly without bouncing. Let the target muscle reach a full stretch before reversing.'),
  ('10000000-0000-4000-8000-000000000218','Hanging Leg Raise','trunk_flexion','bodyweight','abdominals','Keep the pelvis controlled. Bring the rib cage toward the pelvis with a small trunk curl, then return slowly without pulling on the neck.'),
  ('10000000-0000-4000-8000-000000000219','Hanging Knee Raise','trunk_flexion','bodyweight','abdominals','Keep the pelvis controlled. Bring the rib cage toward the pelvis with a small trunk curl, then return slowly without pulling on the neck.'),
  ('10000000-0000-4000-8000-000000000220','Reverse Crunch','trunk_flexion','bodyweight','abdominals','Keep the pelvis controlled. Bring the rib cage toward the pelvis with a small trunk curl, then return slowly without pulling on the neck.'),
  ('10000000-0000-4000-8000-000000000221','Decline Sit-Up','trunk_flexion','bodyweight','abdominals','Keep the pelvis controlled. Bring the rib cage toward the pelvis with a small trunk curl, then return slowly without pulling on the neck. A slight decline keeps tension on the lower chest.'),
  ('10000000-0000-4000-8000-000000000222','Weighted Decline Sit-Up','trunk_flexion','free weight','abdominals','Keep the pelvis controlled. Bring the rib cage toward the pelvis with a small trunk curl, then return slowly without pulling on the neck. A slight decline keeps tension on the lower chest.'),
  ('10000000-0000-4000-8000-000000000223','Ab Wheel Rollout','anti_extension','bodyweight','abdominals','Set the ribs down and squeeze the glutes so the lower back cannot sag. Hold or move slowly, breathing normally, and stop the set when the position breaks. Take three seconds to lower every rep.'),
  ('10000000-0000-4000-8000-000000000224','Plank','anti_extension','bodyweight','abdominals','Set the ribs down and squeeze the glutes so the lower back cannot sag. Hold or move slowly, breathing normally, and stop the set when the position breaks.'),
  ('10000000-0000-4000-8000-000000000225','Weighted Plank','anti_extension','free weight','abdominals','Set the ribs down and squeeze the glutes so the lower back cannot sag. Hold or move slowly, breathing normally, and stop the set when the position breaks.'),
  ('10000000-0000-4000-8000-000000000226','Dead Bug','anti_extension','bodyweight','abdominals','Set the ribs down and squeeze the glutes so the lower back cannot sag. Hold or move slowly, breathing normally, and stop the set when the position breaks. Take three seconds to lower every rep.'),
  ('10000000-0000-4000-8000-000000000227','Cable Woodchop','trunk_rotation','cable','obliques','Keep the hips square and the ribs down. Turn the rib cage against the resistance, pause, and return without letting the weight pull you back. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000228','Pallof Press','trunk_rotation','cable','obliques','Keep the hips square and the ribs down. Turn the rib cage against the resistance, pause, and return without letting the weight pull you back. Anchor the feet or hips so only the target joint moves.'),
  ('10000000-0000-4000-8000-000000000229','Russian Twist','trunk_rotation','free weight','obliques','Keep the hips square and the ribs down. Turn the rib cage against the resistance, pause, and return without letting the weight pull you back.'),
  ('10000000-0000-4000-8000-000000000230','Side Plank','lateral_flexion','bodyweight','obliques','Stand or lie tall with the pelvis level. Bend directly to one side without rotating, then return by pulling the rib cage back over the hip. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000231','Dumbbell Side Bend','lateral_flexion','dumbbell','obliques','Stand or lie tall with the pelvis level. Bend directly to one side without rotating, then return by pulling the rib cage back over the hip. Train each side separately and keep the pelvis level.'),
  ('10000000-0000-4000-8000-000000000232','Hanging Oblique Raise','lateral_flexion','bodyweight','obliques','Stand or lie tall with the pelvis level. Bend directly to one side without rotating, then return by pulling the rib cage back over the hip. Train each side separately and keep the pelvis level.')
on conflict (id) do nothing;

commit;
