import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import { NUTRIENT_UNITS } from '../../src/types/nutrition';

const alice = '20000000-0000-4000-8000-000000000001';
const bob = '20000000-0000-4000-8000-000000000002';
const aliceWorkout = '30000000-0000-4000-8000-000000000001';
const bobWorkout = '30000000-0000-4000-8000-000000000002';
const row = '10000000-0000-4000-8000-000000000001';
const bobExercise = '40000000-0000-4000-8000-000000000001';

test('fresh Supabase schema: permissions, nutrition constraints, and workout integrity', async (t) => {
  const db = new PGlite();
  try {
    // A local PostgreSQL test shim only. Supabase supplies these in production.
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
    await db.exec(`
      insert into auth.users (id) values ('${alice}'), ('${bob}');
      insert into public.users (id) values ('${alice}'), ('${bob}');
      insert into public.workouts (id, user_id, workout_date) values
        ('${aliceWorkout}', '${alice}', '2026-09-07'), ('${bobWorkout}', '${bob}', '2026-09-07');
      insert into public.exercises (id, owner_user_id, name, movement_pattern, equipment, primary_muscle)
        values ('${bobExercise}', '${bob}', 'Custom Row', 'horizontal_pull', 'cable', 'back');
    `);
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

    await t.test('nutrient units exactly match TypeScript and every public table has RLS', async () => {
      const definitions = await db.query<{ key: string; unit: string }>('select key, unit from public.nutrient_definitions');
      assert.deepEqual(Object.fromEntries(definitions.rows.map(({ key, unit }) => [key, unit])), NUTRIENT_UNITS);
      const unprotected = await db.query(`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`);
      assert.deepEqual(unprotected.rows, []);
    });

    await t.test('anonymous users have no table access or trigger RPC access', async () => {
      await db.exec('set role anon');
      await fails('select * from public.users', '42501');
      await fails('select * from public.gym_busyness_votes', '42501');
      await fails('select public.update_workout_volume()', '42501');
    });

    await t.test('profiles are private and cannot be reassigned to another user', async () => {
      await signIn(alice);
      assert.deepEqual((await db.query<{ id: string }>('select id from public.users')).rows, [{ id: alice }]);
      await db.exec('update public.users set height_cm = 180, weight_kg = 80');
      await fails(`update public.users set id = '${bob}'`, '42501');
      await fails("update public.users set height_cm = 'NaN'");
      const changed = await db.query(`update public.users set weight_kg = 100 where id = '${bob}' returning id`);
      assert.deepEqual(changed.rows, []);
    });

    await t.test('daily nutrition distinguishes unknown from zero and validates adherent days', async () => {
      await signIn(alice);
      await db.exec(`insert into public.daily_nutrition_logs (user_id, log_date, micronutrients)
        values ('${alice}', '2026-09-07', '{"sodium_mg":0,"fiber_g":14.5}')`);
      const daily = await db.query<{ calories_kcal: string | null; micronutrients: Record<string, number> }>(
        'select calories_kcal, micronutrients from public.daily_nutrition_logs');
      assert.equal(daily.rows[0].calories_kcal, null);
      assert.deepEqual(daily.rows[0].micronutrients, { sodium_mg: 0, fiber_g: 14.5 });
      await fails('update public.daily_nutrition_logs set is_adherent = true');
      await db.exec(`update public.daily_nutrition_logs set calories_kcal = 2000, protein_g = 150,
        carbs_g = 200, fat_g = 60, is_adherent = true`);
      for (const json of ['{"sodium_mg":-1}', '{"sodium_mg":"10"}', '{"sodium_mg":null}',
        '{"sodium_mg":{}}', '{"not_a_nutrient":0}', '[]', '{"water_g":1e400}']) {
        await fails(`update public.daily_nutrition_logs set micronutrients = '${json}'`);
      }
      await fails("update public.daily_nutrition_logs set protein_g = 'NaN'");
      await fails(`insert into public.daily_nutrition_logs (user_id, log_date) values ('${alice}', '2026-09-07')`, '23505');
      await fails(`insert into public.daily_nutrition_logs (user_id, log_date) values ('${bob}', '2026-09-08')`, '42501');
      await signIn(bob);
      assert.deepEqual((await db.query('select * from public.daily_nutrition_logs')).rows, []);
      await db.exec(`insert into public.daily_nutrition_logs (user_id, log_date) values ('${bob}', '2026-09-07')`);
      await db.exec('delete from public.daily_nutrition_logs');
    });

    await t.test('catalogue is shared and only owner custom variations can be edited', async () => {
      await signIn(alice);
      assert.equal((await db.query('select id from public.exercises')).rows.length, 2);
      assert.deepEqual((await db.query("update public.exercises set name = 'Oops' where owner_user_id is null returning id")).rows, []);
      await fails(`insert into public.exercises (name, movement_pattern, equipment, primary_muscle)
        values ('Fake Catalogue', 'row', 'cable', 'back')`, '42501');
      await db.exec(`insert into public.exercises (owner_user_id, name, movement_pattern, equipment, primary_muscle)
        values ('${alice}', 'My Row', 'row', 'cable', 'back')`);
      await db.exec("update public.exercises set grip_orientation = 'neutral' where name = 'My Row'");
      await fails("update public.exercises set owner_user_id = null where name = 'My Row'", '42501');
      await db.exec("delete from public.exercises where name = 'My Row'");
    });

    await t.test('sets enforce ownership, RPE, ordering, generated 1RM, and volume accounting', async () => {
      await signIn(alice);
      const columns = '(workout_id, exercise_id, exercise_position, set_position, weight_kg, reps, is_completed)';
      await fails(`insert into public.sets ${columns} values ('${aliceWorkout}', '${bobExercise}', 1, 1, 100, 5, true)`);
      await fails(`insert into public.sets ${columns} values ('${bobWorkout}', '${row}', 1, 1, 100, 5, true)`, '42501');
      await db.exec(`insert into public.sets ${columns} values ('${aliceWorkout}', '${row}', 1, 1, 100, 5, true)`);
      const estimate = await db.query<{ estimated_1rm_kg: string }>('select estimated_1rm_kg from public.sets');
      assert.equal(Number(estimate.rows[0].estimated_1rm_kg), 112.5);
      const volume = async () => Number((await db.query<{ volume_kg_reps: string }>(`select volume_kg_reps from public.workouts where id = '${aliceWorkout}'`)).rows[0].volume_kg_reps);
      assert.equal(await volume(), 500);
      await fails('update public.sets set rpe = 11');
      await fails('update public.sets set weight_kg = -1');
      await fails('update public.sets set set_position = 0');
      await fails(`insert into public.sets ${columns} values ('${aliceWorkout}', '${row}', 1, 1, 100, 5, true)`, '23505');
      await fails(`update public.workouts set volume_kg_reps = 999 where id = '${aliceWorkout}'`, '42501');
      await db.exec('update public.sets set reps = 6');
      assert.equal(await volume(), 600);
      await db.exec('update public.sets set is_warmup = true');
      assert.equal(await volume(), 0);
      await db.exec('update public.sets set is_warmup = false, is_completed = false');
      assert.equal(await volume(), 0);
      assert.equal((await db.query<{ estimated_1rm_kg: null }>('select estimated_1rm_kg from public.sets')).rows[0].estimated_1rm_kg, null);
      await db.exec('update public.sets set is_completed = true');
      await signIn(bob);
      assert.deepEqual((await db.query('select * from public.sets')).rows, []);
      assert.deepEqual((await db.query('delete from public.sets returning id')).rows, []);
      await signIn(alice);
      await db.exec('delete from public.sets');
      assert.equal(await volume(), 0);
    });

    await t.test('gym votes validate location/status, keep location history private, and assign timestamps', async () => {
      await signIn(alice);
      await db.exec(`insert into public.gym_busyness_votes (user_id, location_slug, status) values ('${alice}', 'werblin', 'Quiet')`);
      await fails("update public.gym_busyness_votes set status = 'empty'");
      await fails(`insert into public.gym_busyness_votes (user_id, location_slug, status) values ('${alice}', 'unknown', 'Quiet')`, '23503');
      await fails(`insert into public.gym_busyness_votes (user_id, location_slug, status) values ('${bob}', 'werblin', 'Packed')`, '42501');
      await fails("update public.gym_busyness_votes set created_at = now() + interval '1 day'", '42501');
      await db.exec("update public.gym_busyness_votes set status = 'Normal'");
      await signIn(bob);
      assert.deepEqual((await db.query('select * from public.gym_busyness_votes')).rows, []);
      await signIn(alice);
      await db.exec('delete from public.gym_busyness_votes');
      assert.deepEqual((await db.query('select * from public.gym_busyness_votes')).rows, []);
    });

    await t.test('Phase 3 retry writes obey grants and preserve generated Brzycki and volume', async () => {
      await signIn(alice);
      const id = '30000000-0000-4000-8000-000000000099';
      for (let retry = 0; retry < 2; retry++) {
        await db.query(`insert into public.users (id) values ($1) on conflict (id) do nothing`, [alice]);
        await db.query(`insert into public.workouts (id, user_id, workout_date, name, started_at)
          values ($1, $2, '2026-09-07', 'Upper A', '2026-09-07T10:00:00Z') on conflict (id) do nothing`, [id, alice]);
        await db.query(`insert into public.sets (workout_id, exercise_id, exercise_position, set_position, weight_kg, reps, is_completed)
          values ($1, $2, 1, 1, 100, 5, true) on conflict (workout_id, exercise_position, set_position)
          do update set weight_kg = excluded.weight_kg, reps = excluded.reps, is_completed = excluded.is_completed`, [id, row]);
      }
      await db.query(`update public.workouts set finished_at = '2026-09-07T11:00:00Z', duration_seconds = 3600 where id = $1`, [id]);
      const sets = await db.query<{ estimated_1rm_kg: string }>('select estimated_1rm_kg from public.sets where workout_id = $1', [id]);
      assert.equal(sets.rows.length, 1); assert.equal(Number(sets.rows[0].estimated_1rm_kg), 112.5);
      const volume = await db.query<{ volume_kg_reps: string }>('select volume_kg_reps from public.workouts where id = $1', [id]);
      assert.equal(Number(volume.rows[0].volume_kg_reps), 500);
    });

    await t.test('onboarding enforces distinct days, complete targets and pre-workout allocation', async () => {
      await signIn(alice);
      await fails("update public.users set onboarding_completed_at = now()");
      await fails("update public.users set training_days = array[1,1,4,5]");
      await fails("update public.users set training_targets = '{\"caloriesKcal\":2000}'");
      await db.exec(`update public.users set height_cm = 180, weight_kg = 80, activity_level = 'moderate', goal = 'maintain',
        is_advanced_track = true, training_days = array[1,2,4,5], training_targets = '{"caloriesKcal":2400,"proteinG":160,"carbsG":300,"fatG":60}',
        preworkout_fast_carbs = true, preworkout_carbs_g = 30, onboarding_completed_at = now()`);
      await fails('update public.users set preworkout_carbs_g = 301');
      await fails('update public.users set is_advanced_track = false');
    });
    await t.test('crowd RPC aggregates latest reports without exposing voter histories', async () => {
      await db.exec('reset role');
      await db.exec(`insert into public.gym_busyness_votes (user_id, location_slug, status, created_at) values
        ('${alice}', 'werblin', 'Packed', now() - interval '10 minutes'),
        ('${alice}', 'werblin', 'Quiet', now() - interval '1 minute'),
        ('${bob}', 'werblin', 'Normal', now() - interval '2 minutes'),
        ('${bob}', 'college-ave', 'Packed', now() - interval '31 minutes')`);
      await signIn(alice);
      const result = await db.query<{ location_slug: string; vote_count: number; crowd_score: string | null }>('select * from public.get_gym_busyness()');
      const werblin = result.rows.find(row => row.location_slug === 'werblin')!;
      assert.equal(Number(werblin.vote_count), 2); assert.equal(Number(werblin.crowd_score), 25);
      assert.equal(result.rows.find(row => row.location_slug === 'college-ave')!.crowd_score, null);
      assert.equal((await db.query('select * from public.gym_busyness_votes')).rows.length, 2);
      await db.exec('reset role; set role anon');
      await fails('select * from public.get_gym_busyness()', '42501');
      await fails('select * from private.gym_vote_summary()', '42501');
    });

    await t.test('profile deletion cascades owned nutrition, workouts, custom lifts, and sets', async () => {
      await signIn(alice);
      await db.exec(`insert into public.sets (workout_id, exercise_id, exercise_position, set_position, weight_kg, reps, is_completed)
        values ('${aliceWorkout}', '${row}', 1, 1, 90, 5, true)`);
      await db.exec('delete from public.users');
      await db.exec('reset role');
      assert.deepEqual((await db.query(`select * from public.workouts where user_id = '${alice}'`)).rows, []);
      assert.deepEqual((await db.query(`select * from public.sets where workout_id = '${aliceWorkout}'`)).rows, []);
      assert.deepEqual((await db.query(`select * from public.daily_nutrition_logs where user_id = '${alice}'`)).rows, []);
      assert.equal((await db.query('select id from public.users')).rows.length, 1);
    });
  } finally {
    await db.close();
  }
});
