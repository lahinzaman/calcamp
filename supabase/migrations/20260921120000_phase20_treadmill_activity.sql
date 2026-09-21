begin;
-- A treadmill read off its own console. Distinct from a health source because it is entered by
-- the person rather than measured by a device they carried, and because it *adds* to the day:
-- healthkit and health-connect are two views of the same walking, so the reader takes the
-- better of them, but a treadmill session the phone never saw is extra ground covered.
alter table public.daily_activity_snapshots drop constraint daily_activity_snapshots_source_check;
alter table public.daily_activity_snapshots add constraint daily_activity_snapshots_source_check
  check (source in ('healthkit', 'health-connect', 'treadmill'));

-- What the console showed, kept beside the step count it produced. Nothing here is required:
-- a console that shows only distance and time is still worth recording, and a figure that was
-- not on the display stays null rather than becoming a zero.
alter table public.daily_activity_snapshots
  add column distance_m numeric(12,3) check (distance_m is null or (distance_m >= 0 and distance_m <= 1000000)),
  add column duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 86400),
  -- Whether the step figure was displayed by the machine or derived from distance and stride.
  -- An estimate must never be indistinguishable from a measurement once it is stored.
  add column steps_estimated boolean not null default false;

-- Only a manual source may carry an estimate or a console reading; a health snapshot is a
-- measurement, and marking one estimated would quietly change what the number means.
alter table public.daily_activity_snapshots add constraint activity_estimates_are_manual
  check (source = 'treadmill' or (not steps_estimated and distance_m is null and duration_seconds is null));
-- The old six-argument function is replaced by one that also records the console reading.
drop function if exists public.save_activity_snapshot(uuid,date,text,integer,numeric,timestamptz);
-- Carries what the console showed alongside the step figure. The three new parameters default,
-- so an app build that predates them keeps calling this with six named arguments and works.
--
-- Replace, not accumulate. A treadmill day holds the running total the device has computed, so
-- a retried upload writes the same total rather than adding a second session that never
-- happened — the sync queue retries, and an accumulating write would double-count on every one.
create or replace function public.save_activity_snapshot(
  p_owner uuid, p_date date, p_source text, p_steps integer, p_energy numeric, p_observed_at timestamptz,
  p_distance_m numeric default null, p_duration_seconds integer default null, p_steps_estimated boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_owner is distinct from (select auth.uid()) then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_date is null or p_date < date '2000-01-01' or p_date > current_date + 1 or p_observed_at is null or p_observed_at > now() + interval '5 minutes' then raise exception 'Invalid observation' using errcode = '22023'; end if;
  insert into public.daily_activity_snapshots(user_id,activity_date,source,steps,active_energy_kcal,observed_at,distance_m,duration_seconds,steps_estimated)
  values((select auth.uid()),p_date,p_source,p_steps,p_energy,p_observed_at,p_distance_m,p_duration_seconds,coalesce(p_steps_estimated,false))
  on conflict(user_id,activity_date,source) do update set steps=excluded.steps,active_energy_kcal=excluded.active_energy_kcal,observed_at=excluded.observed_at,
    distance_m=excluded.distance_m,duration_seconds=excluded.duration_seconds,steps_estimated=excluded.steps_estimated
  where excluded.observed_at > public.daily_activity_snapshots.observed_at;
end $$;
revoke all on function public.save_activity_snapshot(uuid,date,text,integer,numeric,timestamptz,numeric,integer,boolean) from public, anon;
grant execute on function public.save_activity_snapshot(uuid,date,text,integer,numeric,timestamptz,numeric,integer,boolean) to authenticated;
commit;
