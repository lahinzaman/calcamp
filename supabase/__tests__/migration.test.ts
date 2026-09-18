import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import { EXERCISE_CATALOG } from '../../src/modules/workout/catalog';

const alice = '20000000-0000-4000-8000-000000000001';
const bob = '20000000-0000-4000-8000-000000000002';
const MIGRATION = '20260911120000_phase10_food_entries_measurements.sql';
const ROUTINE_MIGRATION = '20260911210000_phase12_routine_plan.sql';

/** Applies against a database holding everything except these two tables — the live shape. */
test('Phase 10 migration applies to the deployed schema and enforces per-user isolation', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    // Reproduce the live database: the full schema minus exactly what this migration adds.
    // Dropping is deterministic, where reading an earlier git ref changes meaning once merged.
    await db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
    await db.exec('drop table public.food_entries; drop table public.body_measurements;');
    await db.exec(`
      insert into auth.users (id) values ('${alice}'), ('${bob}');
      insert into public.users (id) values ('${alice}'), ('${bob}');
    `);
    await db.exec(await readFile(new URL(`../migrations/${MIGRATION}`, import.meta.url), 'utf8'));

    const signIn = async (user: string) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
      await db.exec('set role authenticated');
    };
    const fails = async (sql: string, expectedCode = '23514') => {
      await assert.rejects(db.exec(sql), (error: unknown) => {
        assert.equal((error as { code?: string }).code, expectedCode);
        return true;
      });
    };

    await t.test('food entries are private, validated, and cascade with the owner', async () => {
      await db.exec('set role anon'); await fails('select * from public.food_entries', '42501');
      await signIn(alice);
      await db.exec(`insert into public.food_entries(id,user_id,log_date,meal,name,servings,source,calories_kcal,protein_g,carbs_g,fat_g)
        values ('e1','${alice}','2026-09-11','lunch','Rice bowl',2,'dining',400,20,60,10)`);
      await fails(`insert into public.food_entries(id,user_id,log_date,meal,name,servings,source,calories_kcal,protein_g,carbs_g,fat_g)
        values ('e2','${alice}','2026-09-11','brunch','X',1,'dining',1,1,1,1)`);
      await fails(`insert into public.food_entries(id,user_id,log_date,meal,name,servings,source,calories_kcal,protein_g,carbs_g,fat_g)
        values ('e3','${alice}','2026-09-11','lunch','X',0,'dining',1,1,1,1)`);
      await fails(`insert into public.food_entries(id,user_id,log_date,meal,name,servings,source,calories_kcal,protein_g,carbs_g,fat_g)
        values ('e4','${alice}','2026-09-11','lunch','X',1,'telepathy',1,1,1,1)`);
      // Another signed-in user can neither read nor write Alice's diary.
      await signIn(bob);
      assert.equal((await db.query('select * from public.food_entries')).rows.length, 0);
      await fails(`insert into public.food_entries(id,user_id,log_date,meal,name,servings,source,calories_kcal,protein_g,carbs_g,fat_g)
        values ('e5','${alice}','2026-09-11','lunch','Sneak',1,'manual',1,1,1,1)`, '42501');
      await signIn(alice);
      assert.equal((await db.query('select * from public.food_entries')).rows.length, 1);
    });

    await t.test('measurements allow unknown fields, reject impossible ones, and hold one row per day', async () => {
      await signIn(alice);
      await db.exec(`insert into public.body_measurements(id,user_id,measured_on,waist_in) values ('m1','${alice}','2026-09-11',32)`);
      const row = (await db.query<{ hips_in: number | null; body_fat_percent: number | null }>('select hips_in, body_fat_percent from public.body_measurements')).rows[0];
      // Unmeasured stays unknown rather than defaulting to zero.
      assert.equal(row.hips_in, null);
      assert.equal(row.body_fat_percent, null);
      await fails(`insert into public.body_measurements(id,user_id,measured_on,body_fat_percent) values ('m2','${alice}','2026-09-12',120)`);
      await fails(`insert into public.body_measurements(id,user_id,measured_on,waist_in) values ('m3','${alice}','2026-09-12',0)`);
      await fails(`insert into public.body_measurements(id,user_id,measured_on,waist_in) values ('m4','${alice}','2026-09-11',33)`, '23505');
    });

    await t.test('deleting a profile removes its entries and measurements', async () => {
      await db.exec('reset role');
      await db.exec(`delete from public.users where id = '${alice}'`);
      assert.equal((await db.query('select * from public.food_entries')).rows.length, 0);
      assert.equal((await db.query('select * from public.body_measurements')).rows.length, 0);
    });
  } finally { await db.close(); }
});

test('the migration leaves schema.sql and the migration in agreement', async () => {
  const migration = await readFile(new URL(`../migrations/${MIGRATION}`, import.meta.url), 'utf8');
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  // Every table, index and policy the migration creates must also exist in the bootstrap schema,
  // or a fresh database and a migrated one would diverge.
  const created = [...migration.matchAll(/create (?:table|index|policy) (?:public\.)?([a-z_]+)/g)].map(match => match[1]);
  assert.ok(created.length >= 10);
  for (const name of created) assert.ok(schema.includes(name), `schema.sql is missing ${name}`);
});


/**
 * ADD COLUMN appends, so a bootstrap schema that declares a new column mid-table produces
 * a different column order than a migrated database — which breaks positional inserts.
 */
test('a migrated workout_routines matches a freshly bootstrapped one, column for column', async () => {
  const shim = `
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `;
  const columns = `select column_name, data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'workout_routines' order by ordinal_position`;
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  const migration = await readFile(new URL(`../migrations/${ROUTINE_MIGRATION}`, import.meta.url), 'utf8');

  const fresh = new PGlite();
  const migrated = new PGlite();
  try {
    await fresh.exec(shim); await fresh.exec(schema);
    await migrated.exec(shim); await migrated.exec(schema);
    // Reproduce the pre-migration table, then migrate it forward.
    await migrated.exec('alter table public.workout_routines drop column exercise_plan, drop column times_per_week;');
    await migrated.exec('drop policy routines_update on public.workout_routines;');
    await migrated.exec(migration);
    const before = (await fresh.query<{ column_name: string; data_type: string }>(columns)).rows;
    const after = (await migrated.query<{ column_name: string; data_type: string }>(columns)).rows;
    assert.deepEqual(after, before, 'migrated and bootstrapped schemas must agree on column order and types');
    assert.ok(before.some(row => row.column_name === 'exercise_plan'));
  } finally { await fresh.close(); await migrated.close(); }
});

const DELETE_MIGRATION = '20260912093000_phase13_self_delete_and_gym_forecast.sql';
const CATALOGUE_MIGRATION = '20260912094000_phase13_exercise_catalogue.sql';

/** Self-service deletion runs in the database, with no backend. Phase 13 also added a
 *  busyness forecast; phase 14 withdrew it, so only deletion and the catalogue are replayed. */
test('Phase 13 migration adds self-deletion and the expanded catalogue', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    await db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
    // Reproduce the deployed database: everything except what this migration introduces.
    await db.exec(`
      drop function public.delete_own_account(); drop function private.delete_own_account();
      delete from public.exercises where id > '10000000-0000-4000-8000-000000000101';
    `);
    await db.exec(`
      insert into auth.users (id) values ('${alice}'), ('${bob}');
      insert into public.users (id) values ('${alice}'), ('${bob}');
    `);
    // Only the deletion half of that migration survives phase 14; the forecast half
    // referenced tables this schema no longer creates.
    const phase13 = await readFile(new URL(`../migrations/${DELETE_MIGRATION}`, import.meta.url), 'utf8');
    await db.exec(phase13.slice(0, phase13.indexOf('-- Busyness forecast built')) + '\ncommit;');
    await db.exec(await readFile(new URL(`../migrations/${CATALOGUE_MIGRATION}`, import.meta.url), 'utf8'));
    const signIn = async (user: string) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
      await db.exec('set role authenticated');
    };

    await t.test('the expanded catalogue matches what the app ships', async () => {
      const seeded = (await db.query<{ id: string }>('select id from public.exercises')).rows.map(row => row.id);
      assert.deepEqual(seeded.slice().sort(), EXERCISE_CATALOG.map(exercise => exercise.id).sort());
    });

    await t.test('deleting your own account erases your rows and leaves everyone else alone', async () => {
      await signIn(alice);
      assert.equal((await db.query<{ delete_own_account: boolean }>('select public.delete_own_account()')).rows[0].delete_own_account, true);
      await db.exec('reset role');
      assert.equal((await db.query(`select id from public.users where id = '${alice}'`)).rows.length, 0);
      assert.equal((await db.query(`select id from auth.users where id = '${alice}'`)).rows.length, 0);
      assert.equal((await db.query(`select id from public.food_entries where user_id = '${alice}'`)).rows.length, 0);
      assert.equal((await db.query(`select id from public.users where id = '${bob}'`)).rows.length, 1);
    });

    await t.test('deletion refuses to run without a session', async () => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
      await db.exec('set role authenticated');
      await assert.rejects(db.query('select public.delete_own_account()'));
    });
  } finally { await db.close(); }
});

const DROP_MIGRATION = '20260912140000_phase14_drop_gym_busyness.sql';

/** The teardown has to run against a database that still has the feature, not a fresh one. */
test('Phase 14 migration removes gym busyness and frees push registrations of its threshold', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    await db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
    // Rebuild the live shape: the tables, RPCs and threshold this migration takes away.
    await db.exec(`
      create table public.gym_locations (slug text primary key, name text not null unique);
      insert into public.gym_locations (slug, name) values ('werblin','Werblin'), ('college-ave','College Ave');
      create table public.gym_busyness_votes (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references public.users (id) on delete cascade,
        location_slug text not null references public.gym_locations (slug),
        status text not null check (status in ('Quiet','Normal','Packed')),
        created_at timestamptz not null default now());
      alter table public.gym_locations enable row level security;
      alter table public.gym_busyness_votes enable row level security;
      create table public.campus_alert_state (
        user_id uuid not null references public.users(id) on delete cascade,
        installation_id uuid not null,
        gym_slug text not null references public.gym_locations(slug),
        below_threshold boolean not null default false,
        primary key(user_id, installation_id, gym_slug));
      alter table public.campus_alert_state enable row level security;
      create function public.claim_campus_alert(p_user uuid,p_installation uuid,p_gym text,p_below boolean)
        returns boolean language sql security invoker set search_path = '' as $$ select p_below $$;
      create function private.gym_vote_summary() returns boolean language sql stable security definer set search_path = '' as $$ select true $$;
      create function public.get_gym_busyness() returns boolean language sql stable security invoker set search_path = '' as $$ select private.gym_vote_summary() $$;
      create function private.gym_hour_forecast() returns boolean language sql stable security definer set search_path = '' as $$ select true $$;
      create function public.get_gym_forecast() returns boolean language sql stable security invoker set search_path = '' as $$ select private.gym_hour_forecast() $$;
    `);
    await db.exec(`insert into auth.users (id) values ('${alice}'); insert into public.users (id) values ('${alice}');`);
    await db.exec(await readFile(new URL(`../migrations/${DROP_MIGRATION}`, import.meta.url), 'utf8'));

    await t.test('every table and function the feature owned is gone', async () => {
      for (const table of ['gym_locations', 'gym_busyness_votes', 'campus_alert_state']) {
        assert.equal((await db.query(
          `select 1 from pg_tables where schemaname = 'public' and tablename = $1`, [table])).rows.length, 0, table);
      }
      for (const fn of ['get_gym_busyness', 'get_gym_forecast', 'claim_campus_alert', 'gym_vote_summary', 'gym_hour_forecast']) {
        assert.equal((await db.query(
          `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public','private') and p.proname = $1`, [fn])).rows.length, 0, fn);
      }
    });

    await t.test('a push registration no longer has to carry an alert threshold', async () => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [alice]);
      await db.exec('set role authenticated');
      const install = '60000000-0000-4000-8000-000000000001';
      const registration = { native_token: 'native', expo_token: 'ExpoPushToken[test]', platform: 'ios', time_zone: 'America/New_York' };
      await db.query('select public.set_push_installation($1,$2,$3)', [alice, install, JSON.stringify(registration)]);
      const tokens = (await db.query<{ push_tokens: Record<string, Record<string, unknown>> }>('select push_tokens from public.profiles')).rows[0].push_tokens;
      assert.equal(Object.keys(tokens).length, 1);
      // The stored shape drops the keys too, rather than writing a field nothing reads.
      assert.equal('threshold' in tokens[install], false);
      assert.equal('gym_alerts' in tokens[install], false);
      assert.equal(tokens[install].time_zone, 'America/New_York');
      // A registration sent by an older build, still carrying the old keys, is accepted.
      await db.query('select public.set_push_installation($1,$2,$3)', [alice, install, JSON.stringify({ ...registration, gym_alerts: true, threshold: 30 })]);
      await assert.rejects(db.query('select public.set_push_installation($1,$2,$3)', [alice, install, JSON.stringify({ ...registration, platform: null })]), { code: '22023' });
    });

    await t.test('a bootstrapped database and a migrated one end up with the same tables', async () => {
      const fresh = new PGlite();
      try {
        await fresh.exec(`
          create role anon; create role authenticated; create role service_role bypassrls;
          create schema auth; create table auth.users (id uuid primary key);
          create function auth.uid() returns uuid language sql stable as
            $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
          grant usage on schema auth to anon, authenticated, service_role;
          grant execute on function auth.uid() to anon, authenticated, service_role;
        `);
        await fresh.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
        const names = async (instance: PGlite) => (await instance.query<{ tablename: string }>(
          `select tablename from pg_tables where schemaname = 'public' order by tablename`)).rows.map(row => row.tablename);
        assert.deepEqual(await names(db), await names(fresh));
      } finally { await fresh.close(); }
    });
  } finally { await db.close(); }
});

const TRAINING_DAYS_MIGRATION = '20260913120000_phase15_flexible_training_days.sql';
/** The constraint as deployed before this migration: advanced profiles had to name exactly four days. */
const FOUR_DAY_CONSTRAINT = `
  alter table public.users drop constraint onboarding_profile_complete;
  alter table public.users add constraint onboarding_profile_complete check (onboarding_completed_at is null or
    (height_cm is not null and weight_kg is not null and activity_level is not null and goal is not null
      and (not is_advanced_track or cardinality(training_days) = 4)));`;

test('Phase 15 migration frees the training schedule without stranding the profiles already saved', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    await db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
    await db.exec(FOUR_DAY_CONSTRAINT);
    await db.exec(`insert into auth.users (id) values ('${alice}'); insert into public.users (id) values ('${alice}');`);
    const complete = `update public.users set height_cm = 180, weight_kg = 80, activity_level = 'moderate',
      goal = 'maintain', is_advanced_track = true, training_days = $1, onboarding_completed_at = now()`;

    await t.test('the deployed constraint is the one this migration is replacing', async () => {
      await db.query(complete, [[1, 2, 4, 5]]);
      await assert.rejects(db.query('update public.users set training_days = $1', [[1, 3, 5]]), { constraint: 'onboarding_profile_complete' });
    });

    await db.exec(await readFile(new URL(`../migrations/${TRAINING_DAYS_MIGRATION}`, import.meta.url), 'utf8'));

    await t.test('any schedule of one to seven days is accepted afterwards, and an empty one still is not', async () => {
      // The four-day profile written before the migration is untouched and still valid.
      assert.equal((await db.query<{ days: number[] }>('select training_days as days from public.users')).rows[0].days.length, 4);
      for (const days of [[3], [1, 3, 5], [1, 2, 3, 5, 6], [0, 1, 2, 3, 4, 5, 6]]) await db.query('update public.users set training_days = $1', [days]);
      await assert.rejects(db.query('update public.users set training_days = $1', [[]]), { constraint: 'onboarding_profile_complete' });
      // Distinctness and the weekday range are still the separate check they always were.
      await assert.rejects(db.query('update public.users set training_days = $1', [[1, 1, 3]]), { constraint: 'training_days_valid' });
      await assert.rejects(db.query('update public.users set training_days = $1', [[7]]), { constraint: 'training_days_valid' });
    });

    await t.test('a bootstrapped database already carries the migrated constraint', async () => {
      const fresh = new PGlite();
      try {
        await fresh.exec(`
          create role anon; create role authenticated; create role service_role bypassrls;
          create schema auth; create table auth.users (id uuid primary key);
          create function auth.uid() returns uuid language sql stable as
            $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
          grant usage on schema auth to anon, authenticated, service_role;
          grant execute on function auth.uid() to anon, authenticated, service_role;
        `);
        await fresh.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
        const definition = async (instance: PGlite) => (await instance.query<{ src: string }>(
          `select pg_get_constraintdef(oid) as src from pg_constraint where conname = 'onboarding_profile_complete'`)).rows[0].src;
        assert.equal(await definition(db), await definition(fresh));
      } finally { await fresh.close(); }
    });
  } finally { await db.close(); }
});

const NOTES_MIGRATION = '20260917120000_phase17_workout_exercise_notes.sql';

/** Applies against a database holding everything except the table it adds — the live shape. */
test('Phase 17 migration adds exercise notes to a deployed database without disturbing it', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    await db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
    await db.exec('drop table public.workout_exercise_notes;');
    const aliceWorkout = '30000000-0000-4000-8000-000000000001';
    await db.exec(`
      insert into auth.users (id) values ('${alice}'), ('${bob}');
      insert into public.users (id) values ('${alice}'), ('${bob}');
      insert into public.workouts (id, user_id, workout_date) values ('${aliceWorkout}', '${alice}', '2026-09-17');
    `);
    await db.exec(await readFile(new URL(`../migrations/${NOTES_MIGRATION}`, import.meta.url), 'utf8'));
    const signIn = async (user: string) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
      await db.exec('set role authenticated');
    };

    await t.test('a migrated database enforces the same ownership a fresh one does', async () => {
      await signIn(alice);
      await db.exec(`insert into public.workout_exercise_notes (workout_id, exercise_position, note)
        values ('${aliceWorkout}', 1, 'Seat 4')`);
      await signIn(bob);
      assert.deepEqual((await db.query('select * from public.workout_exercise_notes')).rows, []);
      await assert.rejects(db.exec(`insert into public.workout_exercise_notes (workout_id, exercise_position, note)
        values ('${aliceWorkout}', 2, 'Not mine')`), (error: unknown) => {
        assert.equal((error as { code?: string }).code, '42501');
        return true;
      });
      await signIn(alice);
      // updated_at is maintained by the shared trigger, which the migration has to attach itself.
      const before = (await db.query<{ updated_at: string }>('select updated_at from public.workout_exercise_notes')).rows[0].updated_at;
      await db.exec("update public.workout_exercise_notes set note = 'Seat 5'");
      const after = (await db.query<{ updated_at: string }>('select updated_at from public.workout_exercise_notes')).rows[0].updated_at;
      assert.ok(new Date(after) >= new Date(before));
    });
  } finally { await db.close(); }
});

test('the exercise-notes migration and schema.sql agree', async () => {
  const migration = await readFile(new URL(`../migrations/${NOTES_MIGRATION}`, import.meta.url), 'utf8');
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  const created = [...migration.matchAll(/create (?:table|index|policy) (?:public\.)?([a-z_]+)/g)].map(match => match[1]);
  assert.ok(created.length >= 5);
  for (const name of created) assert.ok(schema.includes(name), `schema.sql is missing ${name}`);
  // A fresh database must grant exactly what the migration grants, or the two diverge silently.
  for (const grant of ['grant select, insert, update, delete on public.workout_exercise_notes to authenticated']) {
    assert.ok(migration.includes(grant), `the migration is missing: ${grant}`);
  }
  assert.ok(schema.includes('alter table public.workout_exercise_notes enable row level security'));
});
