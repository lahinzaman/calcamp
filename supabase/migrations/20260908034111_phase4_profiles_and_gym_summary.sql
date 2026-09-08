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
