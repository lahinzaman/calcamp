import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const alice = '20000000-0000-4000-8000-000000000001';
const bob = '20000000-0000-4000-8000-000000000002';
const MIGRATION = '20260911120000_phase10_food_entries_measurements.sql';

/** Applies against the previous released schema, which is what the live database actually is. */
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
    // main's schema.sql is the shape of the live project before this migration.
    await db.exec(execFileSync('git', ['show', 'main:supabase/schema.sql'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
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
