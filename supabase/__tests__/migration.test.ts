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

/** Self-service deletion and the community forecast both run in the database, with no backend. */
test('Phase 13 migration adds self-deletion, an hourly forecast, and the expanded catalogue', async (t) => {
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
      drop function public.get_gym_forecast(); drop function private.gym_hour_forecast();
      delete from public.exercises where id > '10000000-0000-4000-8000-000000000101';
    `);
    await db.exec(`
      insert into auth.users (id) values ('${alice}'), ('${bob}');
      insert into public.users (id) values ('${alice}'), ('${bob}');
    `);
    await db.exec(await readFile(new URL(`../migrations/${DELETE_MIGRATION}`, import.meta.url), 'utf8'));
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

    await t.test('the forecast needs a session and averages only this weekday and hour', async () => {
      await db.exec('set role anon');
      await assert.rejects(db.query('select * from public.get_gym_forecast()'));
      await signIn(alice);
      // Votes carry server-assigned timestamps, so history is seeded as the table owner.
      // Same hour last week counts; eight days ago is a different weekday and must not.
      await db.exec('reset role');
      await db.exec(`insert into public.gym_busyness_votes(user_id,location_slug,status,created_at) values
        ('${alice}','werblin','Packed', now()),
        ('${bob}','werblin','Normal', now() - interval '7 days'),
        ('${alice}','werblin','Quiet', now() - interval '8 days'),
        ('${bob}','college-ave','Quiet', now())`);
      await signIn(alice);
      const rows = (await db.query<{ location_slug: string; forecast_score: string | null; sample_count: string }>(
        'select * from public.get_gym_forecast()')).rows;
      const werblin = rows.find(row => row.location_slug === 'werblin')!;
      assert.equal(Number(werblin.sample_count), 2);
      assert.equal(Number(werblin.forecast_score), 75);
      assert.equal(Number(rows.find(row => row.location_slug === 'college-ave')!.forecast_score), 0);
      // A gym nobody has reported on reports no samples rather than disappearing.
      assert.equal(Number(rows.find(row => row.location_slug === 'livingston')!.sample_count), 0);
    });

    await t.test('deleting your own account erases your rows and leaves everyone else alone', async () => {
      await signIn(alice);
      assert.equal((await db.query<{ delete_own_account: boolean }>('select public.delete_own_account()')).rows[0].delete_own_account, true);
      await db.exec('reset role');
      assert.equal((await db.query(`select id from public.users where id = '${alice}'`)).rows.length, 0);
      assert.equal((await db.query(`select id from auth.users where id = '${alice}'`)).rows.length, 0);
      assert.equal((await db.query(`select id from public.gym_busyness_votes where user_id = '${alice}'`)).rows.length, 0);
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
