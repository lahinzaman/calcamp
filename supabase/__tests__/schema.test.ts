import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import { EXERCISE_CATALOG } from '../../src/modules/workout/catalog';
import { LIFTS } from '../../src/modules/workout/program';
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

    await t.test('Phase 9 routines enforce ownership, exercise visibility, retries and user-delete cascade', async () => {
      await db.exec('set role anon'); await fails('select * from public.workout_routines','42501');
      await signIn(alice);
      const id='90000000-0000-4000-8000-000000000001';
      await db.exec(`insert into public.workout_routines(id,user_id,name,exercise_ids) values ('${id}','${alice}','My routine',array['${row}']::uuid[])`);
      await db.exec(`insert into public.workout_routines(id,user_id,name,exercise_ids) values ('${id}','${alice}','My routine',array['${row}']::uuid[]) on conflict(id) do nothing`);
      await fails(`insert into public.workout_routines values ('90000000-0000-4000-8000-000000000002','${alice}','Private lift',array['${bobExercise}']::uuid[],now())`);
      await signIn(bob); assert.equal((await db.query('select * from public.workout_routines')).rows.length,0);
      await fails(`insert into public.workout_routines values ('90000000-0000-4000-8000-000000000003','${alice}','Other user',array['${row}']::uuid[],now())`,'42501');
      await signIn(alice); await fails(`update public.workout_routines set user_id='${bob}'`,'42501');
      const rows=await db.query<{id:string;name:string}>('select id,name from public.exercises where owner_user_id is null');
      assert.deepEqual(rows.rows.sort((a,b)=>a.id.localeCompare(b.id)),EXERCISE_CATALOG.map(e=>({id:e.id,name:e.name})).sort((a,b)=>a.id.localeCompare(b.id)));
      await db.exec('reset role');
    });

    await t.test('nutrient units exactly match TypeScript and every public table has RLS', async () => {
      const definitions = await db.query<{ key: string; unit: string }>('select key, unit from public.nutrient_definitions');
      assert.deepEqual(Object.fromEntries(definitions.rows.map(({ key, unit }) => [key, unit])), NUTRIENT_UNITS);
      const unprotected = await db.query(`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`);
      assert.deepEqual(unprotected.rows, []);
    });

    await t.test('anonymous users have no table access or trigger RPC access', async () => {
      await db.exec('set role anon');
      await fails('select * from public.users', '42501');
      await fails('select * from public.daily_nutrition_logs', '42501');
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
      // Routines validate every exercise ID against this table, so the shipped catalogue
      // and the seeded rows must stay identical — not merely the same size.
      const seeded = (await db.query<{ id: string }>('select id from public.exercises')).rows.map(r => r.id);
      assert.deepEqual(seeded.slice().sort(), EXERCISE_CATALOG.map(e => e.id).sort());
      for (const lift of Object.values(LIFTS)) assert.equal((await db.query<{ name: string }>('select name from public.exercises where id = $1', [lift.id])).rows[0]?.name, lift.name);
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

    await t.test('Phase 17 exercise notes are the workout owner’s and cascade with the session', async () => {
      await signIn(alice);
      const note = "insert into public.workout_exercise_notes (workout_id, exercise_position, note) values";
      await db.exec(`${note} ('${aliceWorkout}', 1, 'Seat 4, pin 7')`);
      // A note keys on the same (workout, exercise_position) pair its sets use, so one exercise
      // occurrence carries one note however many sets it has.
      await fails(`${note} ('${aliceWorkout}', 1, 'Second note')`, '23505');
      await fails(`${note} ('${aliceWorkout}', 0, 'Bad position')`);
      await fails(`${note} ('${aliceWorkout}', 2, '   ')`);
      await fails(`${note} ('${aliceWorkout}', 2, '${'x'.repeat(281)}')`);
      // Bob's workout is not Alice's to annotate, and hers is not his to read.
      await fails(`${note} ('${bobWorkout}', 1, 'Not mine')`, '42501');
      await signIn(bob);
      assert.deepEqual((await db.query('select * from public.workout_exercise_notes')).rows, []);
      assert.deepEqual((await db.query('delete from public.workout_exercise_notes returning note')).rows, []);
      await signIn(alice);
      assert.equal((await db.query('select * from public.workout_exercise_notes')).rows.length, 1);
      await db.exec(`update public.workout_exercise_notes set note = 'Bench 3' where workout_id = '${aliceWorkout}'`);
      await db.exec(`delete from public.workouts where id = '${aliceWorkout}'`);
      assert.deepEqual((await db.query('select * from public.workout_exercise_notes')).rows, [],
        'a deleted session takes its notes with it');
      await db.exec(`insert into public.workouts (id, user_id, workout_date) values ('${aliceWorkout}', '${alice}', '2026-09-07')`);
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
      // Four days was never a rule about training, only about one split. Any real schedule is allowed.
      await db.exec('update public.users set training_days = array[0,1,2,3,5,6]');
      await db.exec('update public.users set training_days = array[3]');
      await fails("update public.users set training_days = '{}'");
      await fails('update public.users set is_advanced_track = false');
    });
    await t.test('branded foods are a shared published catalogue, readable but not editable', async () => {
      await db.exec('reset role');
      await db.exec(`insert into public.branded_foods (brand_name, item_name, serving_size_grams, calories, protein, carbs, fat)
        values ('Chipotle', 'Chicken burrito bowl', 510, 625, 45, 63, 21.5),
               ('Chipotle', 'Chips', 113, 540, 7, 73, 25),
               ('Shah''s Halal Food', 'Chicken over rice', null, 1020, 58, 118, 34)`);
      await signIn(alice);

      // Everyone signed in reads the same catalogue; nobody signed in may change it.
      const rows = await db.query<{ count: string }>('select count(*) as count from public.branded_foods');
      assert.equal(Number(rows.rows[0].count), 3);
      // Writing is not merely policy-denied: the grant itself is absent, so it is a privilege error.
      await fails("insert into public.branded_foods (brand_name, item_name, calories, protein, carbs, fat) values ('Mine', 'X', 1, 1, 1, 1)", '42501');
      await fails("update public.branded_foods set calories = 0", '42501');
      await fails('delete from public.branded_foods', '42501');

      // A portion nobody published stays null rather than becoming a zero-gram serving.
      const halal = await db.query<{ serving_size_grams: string | null }>(
        "select serving_size_grams from public.branded_foods where brand_name = 'Shah''s Halal Food'");
      assert.equal(halal.rows[0].serving_size_grams, null);

      // The brand is weighted above the item, and the word being typed matches as a prefix.
      await db.exec('reset role');
      const hits = await db.query<{ item_name: string }>(
        `select item_name from public.branded_foods where search @@ to_tsquery('simple', $1) order by item_name`, ['chipo:*']);
      assert.deepEqual(hits.rows.map(row => row.item_name), ['Chicken burrito bowl', 'Chips']);
      const across = await db.query<{ item_name: string }>(
        `select item_name from public.branded_foods where search @@ to_tsquery('simple', $1)`, ['chicken & ri:*']);
      assert.deepEqual(across.rows.map(row => row.item_name), ['Chicken over rice']);

      // Published figures cannot be negative, and the same item cannot be listed twice.
      await db.exec('set role service_role');
      await assert.rejects(db.query("insert into public.branded_foods (brand_name, item_name, calories, protein, carbs, fat) values ('A', 'B', -1, 0, 0, 0)"));
      await assert.rejects(db.query("insert into public.branded_foods (brand_name, item_name, calories, protein, carbs, fat) values ('Chipotle', 'Chips', 1, 1, 1, 1)"));
      await assert.rejects(db.query("insert into public.branded_foods (brand_name, item_name, serving_size_grams, calories, protein, carbs, fat) values ('A', 'B', 0, 1, 1, 1, 1)"));
      await db.exec('reset role');
    });

    await t.test('Phase 5 atomic nutrition deltas deduplicate retries and isolate receipts', async () => {
      const id = '50000000-0000-4000-8000-000000000001';
      const id2 = '50000000-0000-4000-8000-000000000002';
      const id3 = '50000000-0000-4000-8000-000000000003';
      const mutate = (key: string, kcal = 100) => `select * from public.apply_nutrition_mutation('${key}', '2026-09-06',
        '{"caloriesKcal":${kcal},"proteinG":10,"carbsG":10,"fatG":2}', '{"fiber_g":2}', '{}')`;
      await db.exec('reset role; set role anon');
      assert.equal((await db.query<{ service_health: boolean }>('select public.service_health()')).rows[0].service_health, true);
      await fails(mutate(id), '42501');
      await signIn(alice);
      await db.exec(mutate(id)); await db.exec(mutate(id)); await db.exec(mutate(id2));
      const total = async () => (await db.query<{ calories_kcal: string; micronutrients: { fiber_g: number } }>("select calories_kcal, micronutrients from public.daily_nutrition_logs where log_date = '2026-09-06'")).rows[0];
      assert.equal(Number((await total()).calories_kcal), 200); assert.equal((await total()).micronutrients.fiber_g, 4);
      await fails(mutate(id, 101), '22023'); await fails(mutate(id3, -500));
      assert.equal(Number((await total()).calories_kcal), 200);
      assert.equal((await db.query('select * from private.nutrition_mutation_receipts')).rows.length, 2);
      // Failed updates did not leave a receipt behind; corrected retry can succeed.
      await db.exec(mutate(id3)); assert.equal(Number((await total()).calories_kcal), 300);
      await signIn(bob); assert.equal((await db.query('select * from private.nutrition_mutation_receipts')).rows.length, 0);
      await db.exec(mutate(id)); assert.equal(Number((await total()).calories_kcal), 100);
      await fails('delete from private.nutrition_mutation_receipts', '42501');
    });

    await t.test('Phase 6 push registrations and activity snapshots enforce owner, RLS, and retry order', async () => {
      const install = '60000000-0000-4000-8000-000000000001';
      const registration = { native_token: 'native', expo_token: 'ExpoPushToken[test]', platform: 'ios', time_zone: 'America/New_York' };
      await signIn(alice);
      await db.query('select public.set_push_installation($1,$2,$3)', [alice, install, JSON.stringify(registration)]);
      await db.query('select public.set_push_installation($1,$2,$3)', [alice, install, JSON.stringify(registration)]);
      const tokens = (await db.query<{ push_tokens: Record<string, unknown> }>('select push_tokens from public.profiles')).rows[0].push_tokens;
      assert.equal(Object.keys(tokens).length, 1);
      await assert.rejects(db.query('select public.set_push_installation($1,$2,$3)', [bob, install, JSON.stringify(registration)]), { code: '42501' });
      await assert.rejects(db.query('select public.set_push_installation($1,$2,$3)', [alice, install, JSON.stringify({ ...registration, platform: null })]), { code: '22023' });
      await db.query("select public.save_activity_snapshot($1,'2026-09-07','healthkit',5000,200,'2026-09-07T18:00:00Z')", [alice]);
      await db.query("select public.save_activity_snapshot($1,'2026-09-07','healthkit',1000,50,'2026-09-07T17:00:00Z')", [alice]);
      await db.query("select public.save_activity_snapshot($1,'2026-09-07','healthkit',5000,200,'2026-09-07T18:00:00Z')", [alice]);
      assert.equal((await db.query<{ steps: number }>('select steps from public.daily_activity_snapshots')).rows[0].steps, 5000);
      await assert.rejects(db.query("select public.save_activity_snapshot($1,'2026-09-07','healthkit',6000,300,now())", [bob]), { code: '42501' });
      await signIn(bob); assert.equal((await db.query('select * from public.profiles')).rows.length, 0);
      assert.equal((await db.query('select * from public.daily_activity_snapshots')).rows.length, 0);
      await db.exec('reset role; set role service_role');
      await db.query('select public.remove_invalid_push_token($1,$2,$3)', [alice, install, 'old-token']);
      assert.equal(Object.keys((await db.query<{ push_tokens: object }>('select push_tokens from public.profiles')).rows[0].push_tokens).length, 1);
      await db.query('select public.remove_invalid_push_token($1,$2,$3)', [alice, install, registration.expo_token]);
      assert.equal(Object.keys((await db.query<{ push_tokens: object }>('select push_tokens from public.profiles')).rows[0].push_tokens).length, 0);
    });

    await t.test('Phase 7 feedback retries, ownership, rate limits, context and server-managed deletion', async () => {
      await signIn(alice);
      const id = '70000000-0000-4000-8000-000000000001';
      const submit = (key: string, owner = alice) => db.query('select public.submit_feedback($1,$2,$3,$4,$5)', [owner, key, 'bug', 'The menu did not load today.', '{"os":"ios"}']);
      await submit(id); await submit(id);
      assert.equal((await db.query('select * from public.user_feedback')).rows.length, 1);
      await assert.rejects(submit(id, bob), { code: '42501' });
      await fails(`update public.users set deletion_requested_at = now()`, '42501');
      await fails(`insert into public.user_feedback(id,user_id,category,message,context) values ('70000000-0000-4000-8000-000000000099','${alice}','bug','A sufficiently long report','{"token":"private"}')`, '22023');
      for (let i = 2; i <= 5; i++) await submit(`70000000-0000-4000-8000-00000000000${i}`);
      await assert.rejects(submit('70000000-0000-4000-8000-000000000006'), { code: 'P0001' });
      await submit(id); // Lost acknowledgements do not consume another daily slot.
      await signIn(bob); assert.equal((await db.query('select * from public.user_feedback')).rows.length, 0);
      await db.exec('reset role; set role anon'); await fails('select * from public.user_feedback', '42501');
      await db.exec('reset role');
      await db.exec(`update public.users set deletion_requested_at = now() where id = '${alice}'`);
      await signIn(alice); assert.equal((await db.query<{ account_accepts_requests: boolean }>('select public.account_accepts_requests()')).rows[0].account_accepts_requests, false);
    });

    await t.test('profile deletion cascades owned nutrition, workouts, custom lifts, and sets', async () => {
      await signIn(alice);
      await db.exec(`insert into public.sets (workout_id, exercise_id, exercise_position, set_position, weight_kg, reps, is_completed)
        values ('${aliceWorkout}', '${row}', 1, 1, 90, 5, true)`);
      await fails('delete from public.users', '42501');
      await db.exec('reset role');
      await db.exec(`delete from auth.users where id = '${alice}'`);
      await db.exec('reset role');
      assert.deepEqual((await db.query(`select * from public.workouts where user_id = '${alice}'`)).rows, []);
      assert.deepEqual((await db.query(`select * from public.sets where workout_id = '${aliceWorkout}'`)).rows, []);
      assert.deepEqual((await db.query(`select * from public.daily_nutrition_logs where user_id = '${alice}'`)).rows, []);
      assert.equal((await db.query('select id from public.users')).rows.length, 1);
      for (const table of ['user_feedback', 'profiles', 'daily_activity_snapshots']) assert.equal((await db.query(`select * from public.${table} where ${table === 'profiles' ? 'id' : 'user_id'} = '${alice}'`)).rows.length, 0);
    });
  } finally {
    await db.close();
  }
});
