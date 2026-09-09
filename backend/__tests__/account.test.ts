import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAccountRouter } from '../account';
import { purgeLogMealHistory } from '../logmeal-account';
test('account route derives owner from verified auth, requires confirmation, and stops on purge failure', async () => {
  const calls: string[] = []; let providerFails = false; let deleted = false;
  const client = { auth: { getUser: async (token: string) => ({ data: { user: token === 'valid' ? { id: 'alice' } : null }, error: null }),
    getClaims: async (token: string) => token === 'lost-ack' ? ({ data: { claims: { sub: 'alice' } } }) : ({ error: true }), admin: {
      getUserById: async () => deleted ? ({ error: { code: 'user_not_found' } }) : ({ data: { user: { id: 'alice' } } }),
      signOut: async () => { calls.push('revoke'); return {}; }, deleteUser: async (id: string, soft: boolean) => { assert.equal(soft, false); calls.push(`delete:${id}`); deleted = true; return {}; } } },
    from: () => ({ update: () => ({ eq: async (_key: string, id: string) => { calls.push(`freeze:${id}`); return {}; } }) }),
  } as unknown as SupabaseClient;
  const app = express(); app.use('/account', createAccountRouter({ client: () => client, purgeProvider: async id => { calls.push(`purge:${id}`); if (providerFails) throw new Error('secret'); } }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/account`;
  const remove = (body: unknown, token = 'valid') => fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  try {
    assert.equal((await remove({ confirmation: 'DELETE' }, 'invalid')).status, 401);
    assert.equal((await remove({})).status, 400); assert.deepEqual(calls, []);
    assert.equal((await remove({ confirmation: 'DELETE' }, 'lost-ack')).status, 401, 'verified claims alone do not delete an existing account');
    providerFails = true; const failed = await remove({ confirmation: 'DELETE' }); assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes('secret')); assert.deepEqual(calls, ['freeze:alice','purge:alice']);
    calls.length = 0; providerFails = false;
    assert.equal((await remove({ confirmation: 'DELETE', userId: 'bob' })).status, 200);
    assert.deepEqual(calls, ['freeze:alice','purge:alice','revoke','delete:alice']);
    assert.deepEqual(await (await remove({ confirmation: 'DELETE' }, 'lost-ack')).json(), { deleted: true });
    assert.equal(calls.length, 4, 'lost acknowledgement never repeats provider deletion');
  } finally { server.close(); await once(server, 'close'); }
});
test('LogMeal purge deletes intake artifacts, accepts an already-deleted intake, and verifies empty history', async () => {
  const paths: string[] = []; let lists = 0;
  const fetcher = (async (url, init) => {
    paths.push(String(url));
    if (init?.method === 'DELETE') return new Response(null, { status: 404 });
    return new Response(JSON.stringify({ intakes_list: lists++ === 0 ? [{ image_id: 12 }] : [] }));
  }) as typeof fetch;
  await purgeLogMealHistory('alice', fetcher, 'private-provider-token');
  assert.equal(paths.length, 3); assert.equal(paths[1], 'https://api.logmeal.com/v2/intake/12');
  await assert.rejects(purgeLogMealHistory('alice', (async () => new Response('{}')) as typeof fetch, 'token'), /history/);
});
