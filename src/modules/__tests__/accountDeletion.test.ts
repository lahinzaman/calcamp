import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

let rpcCalls: string[] = [];
let rpcResult: { data: unknown; error: unknown } = { data: true, error: null };
let session: { user: { id: string }; access_token: string } | null = null;
let signedOut = 0; let cleared: string[] = [];
mock.module('../../api/supabase', { namedExports: { getSupabase: () => ({
  auth: { getSession: async () => ({ data: { session }, error: null }), signOut: async () => { signedOut++; session = null; return { error: null }; } },
  rpc: async (name: string) => { rpcCalls.push(name); return rpcResult; },
}) } });
mock.module('../account/localData', { namedExports: { removeLocalAccountData: (owner: string) => { cleared.push(owner); } } });
mock.module('../notifications/service', { namedExports: { clearNotifications: async () => {} } });
mock.module('../background/geofencing', { namedExports: { stopGeofencing: async () => {} } });
mock.module('../sync/background', { namedExports: { unregisterBackgroundSync: async () => {} } });
mock.module('../sync/runtime', { namedExports: { syncEngine: { owner: 'alice' }, activateSync: () => {} } });

const { deleteAccount } = require('../account/deleteAccount') as typeof import('../account/deleteAccount');

beforeEach(() => {
  rpcCalls = []; cleared = []; signedOut = 0; rpcResult = { data: true, error: null };
  session = { user: { id: 'alice' }, access_token: 'token' };
  delete process.env.EXPO_PUBLIC_BACKEND_URL;
});
afterEach(() => { delete process.env.EXPO_PUBLIC_BACKEND_URL; });

test('deletion runs against the database with no backend configured', async () => {
  const outcome = await deleteAccount('alice');
  assert.deepEqual(rpcCalls, ['delete_own_account']);
  assert.deepEqual(outcome, { identityRemoved: true, providerHistoryPending: false });
  assert.deepEqual(cleared, ['alice']);
});

test('an unreachable backend does not stop the account being deleted', async () => {
  process.env.EXPO_PUBLIC_BACKEND_URL = 'https://offline.example';
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
  try {
    const outcome = await deleteAccount('alice');
    assert.deepEqual(rpcCalls, ['delete_own_account']);
    assert.equal(outcome.identityRemoved, true);
    // The account is gone; only the provider's own copy is reported as unconfirmed.
    assert.equal(outcome.providerHistoryPending, true);
  } finally { globalThis.fetch = original; }
});

test('a database that cannot remove the sign-in says so instead of claiming success', async () => {
  rpcResult = { data: false, error: null };
  assert.deepEqual(await deleteAccount('alice'), { identityRemoved: false, providerHistoryPending: false });
  assert.deepEqual(cleared, ['alice']);
});

test('a failed call reports failure and leaves local data alone', async () => {
  rpcResult = { data: null, error: { message: 'offline' } };
  await assert.rejects(deleteAccount('alice'), /Deletion did not go through/);
  assert.deepEqual(cleared, []);
  assert.equal(signedOut, 0);
});

test('deleting somebody else is refused before anything is touched', async () => {
  await assert.rejects(deleteAccount('mallory'), /Sign in again/);
  assert.deepEqual(rpcCalls, []);
  assert.deepEqual(cleared, []);
});
