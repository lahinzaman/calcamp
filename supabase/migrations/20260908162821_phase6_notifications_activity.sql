begin;
-- Existing personal profile fields remain in users. This extension isolates device registrations.
alter table public.profiles
add column if not exists push_tokens jsonb not null default '{}'::jsonb check (jsonb_typeof(push_tokens) = 'object' and pg_column_size(push_tokens) < 65536);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
drop policy if exists own_notification_profile on public.profiles;
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

create table if not exists public.daily_activity_snapshots (
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
drop policy if exists own_activity on public.daily_activity_snapshots;
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
create table if not exists public.campus_alert_state (
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
create index  if not exists pending_campus_receipts on public.campus_alert_state(ticket_created_at) where not receipt_checked;
commit;
