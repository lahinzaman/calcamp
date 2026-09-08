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
