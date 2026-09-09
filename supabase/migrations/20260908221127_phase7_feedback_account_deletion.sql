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
