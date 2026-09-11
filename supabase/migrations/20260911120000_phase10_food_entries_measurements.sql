begin;
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
commit;
