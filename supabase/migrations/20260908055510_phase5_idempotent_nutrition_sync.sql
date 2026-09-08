CREATE SCHEMA IF NOT EXISTS private;

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
