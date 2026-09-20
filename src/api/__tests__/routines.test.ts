import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';

test('a routine edit is written to the row rather than skipped as a duplicate', async () => {
  const sent: { method: string; prefer: string | null; query: string; body: unknown }[] = [];
  const client = createClient('https://test.supabase.co', 'public-key',
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
      sent.push({ method: init?.method ?? 'GET', prefer: new Headers(init?.headers).get('prefer'),
        query: new URL(String(input)).search, body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(null, { status: 201 });
    } } });
  const { saveRoutine } = await import('../routines');
  await saveRoutine('20000000-0000-4000-8000-000000000001', {
    id: '9b2f1c44-5d6e-4a7b-8c9d-0e1f2a3b4c5d', name: 'Push A',
    exerciseIds: ['10000000-0000-4000-8000-000000000001'],
    exercises: [{ exerciseId: '10000000-0000-4000-8000-000000000001', sets: 3, restSeconds: 120, repLow: 6, repHigh: 12 }],
    timesPerWeek: 2,
  }, client);

  const write = sent.at(-1)!;
  assert.ok(write.query.includes('on_conflict=id'));
  // resolution=ignore-duplicates is ON CONFLICT DO NOTHING: the server accepts the request and
  // keeps the row it already had, so an edited routine never changed in the cloud.
  assert.ok(!(write.prefer ?? '').includes('ignore-duplicates'),
    'an edit has to overwrite the stored routine, not be discarded as already present');
  assert.equal((write.body as Record<string, unknown>).name, 'Push A');
  assert.equal((write.body as Record<string, unknown>).times_per_week, 2);
});
