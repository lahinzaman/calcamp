begin;

-- Gym busyness is withdrawn. Google never exposed popular times through an API, the only
-- providers resell scraped Maps data, and Rutgers publishes no live headcount — so the
-- feature had no source it could stand on. Everything it owned goes with it.
--
-- DESTRUCTIVE: this deletes the community busyness reports in gym_busyness_votes. They are
-- the only copy; nothing else in the app reads them.
drop function if exists public.get_gym_forecast();
drop function if exists private.gym_hour_forecast();
drop function if exists public.get_gym_busyness();
drop function if exists private.gym_vote_summary();
drop function if exists public.claim_campus_alert(uuid, uuid, text, boolean);

drop table if exists public.campus_alert_state;
drop table if exists public.gym_busyness_votes;
drop table if exists public.gym_locations;

-- Push registrations carried the alert threshold for those notifications and nothing else.
-- Existing stored registrations keep their now-ignored keys; new ones are written without.
create or replace function public.set_push_installation(p_owner uuid, p_installation uuid, p_registration jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := (select auth.uid()); current_tokens jsonb;
begin
  if owner_id is null or p_owner is distinct from owner_id then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_installation is null then raise exception 'Installation required' using errcode = '22023'; end if;
  if p_registration is not null and (
    jsonb_typeof(p_registration) <> 'object' or
    not (p_registration ?& array['native_token','expo_token','platform','time_zone']) or
    jsonb_typeof(p_registration->'native_token') <> 'string' or length(p_registration->>'native_token') not between 1 and 4096 or
    jsonb_typeof(p_registration->'expo_token') <> 'string' or length(p_registration->>'expo_token') not between 1 and 512 or
    jsonb_typeof(p_registration->'platform') <> 'string' or p_registration->>'platform' not in ('ios','android') or
    jsonb_typeof(p_registration->'time_zone') <> 'string' or not exists(select 1 from pg_catalog.pg_timezone_names where name = p_registration->>'time_zone')
  ) then raise exception 'Invalid push registration' using errcode = '22023'; end if;
  insert into public.profiles(id) values(owner_id) on conflict(id) do nothing;
  select push_tokens into current_tokens from public.profiles where id = owner_id for update;
  if p_registration is null then current_tokens := current_tokens - p_installation::text;
  else
    if not(current_tokens ? p_installation::text) and (select count(*) from jsonb_object_keys(current_tokens)) >= 12 then raise exception 'Too many installations' using errcode = '22023'; end if;
    current_tokens := jsonb_set(current_tokens, array[p_installation::text], jsonb_build_object(
      'native_token',p_registration->'native_token','expo_token',p_registration->'expo_token','platform',p_registration->'platform',
      'time_zone',p_registration->'time_zone','last_seen',now(),'expires_at',now() + interval '30 days'));
  end if;
  update public.profiles set push_tokens = current_tokens where id = owner_id;
end $$;
revoke all on function public.set_push_installation(uuid,uuid,jsonb) from public, anon;
grant execute on function public.set_push_installation(uuid,uuid,jsonb) to authenticated;

commit;
