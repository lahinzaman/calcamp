begin;

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

commit;
