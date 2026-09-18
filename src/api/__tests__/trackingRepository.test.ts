import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createTrackingRepository } from '../trackingRepository';
import type { CompletedWorkout } from '../../types/workout';

test('real supabase-js sends owner-scoped, duplicate-safe writes and omits generated columns', async () => {
  const requests: { table: string; method: string; body: Record<string, unknown> | Record<string, unknown>[]; prefer: string | null; query: string }[] = [];
  let finished = false, failSets = true;
  let storedSets: { id: string; exercise_position: number; set_position: number }[] = [];
  const client = createClient('https://test.supabase.co', 'public-key', { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: async (input, init) => {
      const url = new URL(String(input)); const table = url.pathname.split('/').at(-1)!;
      const method = init?.method ?? 'GET'; const body = init?.body ? JSON.parse(String(init.body)) : {};
      requests.push({ table, method, body, prefer: new Headers(init?.headers).get('prefer'), query: url.search });
      if (table === 'sets' && failSets) { failSets = false; return Response.json({ message: 'Transient failure' }, { status: 503 }); }
      // Reading back the stored sets is how an edit finds the rows it no longer has.
      if (table === 'sets' && method === 'GET') return Response.json(storedSets);
      if (table === 'workouts' && method === 'GET') return Response.json({ finished_at: finished ? '2026-09-07T12:00:00Z' : null });
      if (table === 'workouts' && method === 'PATCH') { finished = true; return Response.json({ id: 'saved' }); }
      return new Response(null, { status: 201 });
    },
  } });
  client.auth.getUser = async () => ({ data: { user: { id: '20000000-0000-4000-8000-000000000001' } }, error: null }) as Awaited<ReturnType<typeof client.auth.getUser>>;
  const repo = createTrackingRepository(client); const user = await repo.userId();
  const workout: CompletedWorkout = { session: { id: 'local-123', name: 'Upper A', startedAtMs: 1_000 }, endedAtMs: 61_000,
    exercises: [{ id: 'first', exercise: { id: '10000000-0000-4000-8000-000000000001', name: 'Row' }, defaultRestSeconds: 90 }],
    sets: [{ id: 'set', sessionExerciseId: 'first', weightLbs: 100, reps: 5, rpe: 8, kind: 'normal' as const, durationSeconds: null, distanceMeters: null, restSeconds: 90, estimatedOneRepMaxLbs: 112.5, completedAtMs: 30_000 }] };
  await assert.rejects(repo.saveWorkout(user, workout), /Transient failure/);
  assert.equal(finished, false);
  const firstId = (requests.find(r => r.table === 'workouts' && r.method === 'POST')!.body as Record<string, unknown>).id;
  const id = await repo.saveWorkout(user, workout); assert.equal(id, firstId);
  assert.match(String(id), /^[0-9a-f-]{36}$/);
  const inserts = requests.filter(r => r.table === 'sets' && r.method === 'POST');
  assert.equal(inserts.length, 2); assert.deepEqual(inserts[0].body, inserts[1].body);
  assert.ok(inserts[1].query.includes('on_conflict=workout_id%2Cexercise_position%2Cset_position'));
  assert.ok(!JSON.stringify(requests.map(r => r.body)).includes('estimated_1rm_kg'));
  assert.ok(!JSON.stringify(requests.map(r => r.body)).includes('volume_kg_reps'));
  // Write-once: a third send of the same finished workout must not touch its sets again.
  await repo.saveWorkout(user, workout); assert.equal(requests.filter(r => r.table === 'sets' && r.method === 'POST').length, 2);
  await repo.saveDay(user, { date: '2026-09-07', consumedMacros: { caloriesKcal: 200, proteinG: 10, carbsG: 20, fatG: 8 },
    consumedMicros: { sodium_mg: 100 }, bodyWeightLbs: 70, isAdherent: true });
  const daily = requests.find(r => r.table === 'daily_nutrition_logs')!;
  assert.equal((daily.body as Record<string, unknown>).user_id, user);
  assert.ok(daily.query.includes('on_conflict=user_id%2Clog_date'));

  // A revision of a finished workout: the write-once guard steps aside only for an explicit edit.
  storedSets = [{ id: 'row-1', exercise_position: 1, set_position: 1 }, { id: 'row-2', exercise_position: 1, set_position: 2 }];
  const before = requests.length;
  await repo.saveWorkout(user, { ...workout, editedAtMs: 2_000, session: { ...workout.session, name: 'Upper A · corrected' },
    exercises: [{ ...workout.exercises[0], note: 'seat 4' }] });
  const sent = requests.slice(before);
  assert.ok(sent.some(r => r.table === 'sets' && r.method === 'POST'), 'the corrected set is written');
  // The edit kept one set, so the second stored row is no longer part of the session.
  const pruned = sent.find(r => r.table === 'sets' && r.method === 'DELETE')!;
  assert.ok(pruned.query.includes('row-2'), 'a set the edit removed is deleted');
  assert.ok(!pruned.query.includes('row-1'), 'a set the edit kept is not');
  const note = sent.find(r => r.table === 'workout_exercise_notes' && r.method === 'POST')!;
  assert.deepEqual(note.body, [{ workout_id: firstId, exercise_position: 1, note: 'seat 4' }]);
  assert.equal((sent.find(r => r.table === 'workouts' && r.method === 'PATCH')!.body as Record<string, unknown>).name, 'Upper A · corrected');

  await repo.deleteWorkout(user, 'local-123');
  const removed = requests.at(-1)!;
  assert.equal(removed.table, 'workouts'); assert.equal(removed.method, 'DELETE');
  assert.ok(removed.query.includes(String(firstId)), 'deletes the row this session maps to');
  assert.ok(removed.query.includes(user), 'and only the signed-in owner’s copy of it');
});
