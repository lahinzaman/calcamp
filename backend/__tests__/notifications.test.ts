import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotificationWorker, eligibleRegistration } from '../notification-worker';
import type { GymBaseline } from '../../src/types/facilities';
const now = new Date('2026-09-08T16:00:00Z');
const registration = { expo_token: 'ExpoPushToken[test]', platform: 'ios', gym_alerts: true, threshold: 30, time_zone: 'America/New_York', expires_at: '2026-10-01T00:00:00Z' };
test('worker rejects disabled, expired, malformed, and quiet-hours registrations', () => {
  assert.equal(eligibleRegistration(registration, now), true);
  for (const patch of [{ gym_alerts: false }, { expires_at: 'invalid' }, { expires_at: '2020-01-01' }, { time_zone: '' }, { time_zone: 'bad' }, { threshold: NaN }, { platform: 'web' }, { expo_token: 'native' }]) assert.equal(eligibleRegistration({ ...registration, ...patch }, now), false);
  assert.equal(eligibleRegistration(registration, new Date('2026-09-09T03:00:00Z')), false);
});
test('worker claims crossings once, skips stale baselines, and records delivery tickets', async () => {
  const updates: unknown[] = []; let claimed = false; let sends = 0;
  const query = (table: string) => {
    const value = { select() { return value; }, eq() { return value; }, lt() { return value; }, order() { return value; }, limit() { return value; }, range() { return value; },
      update(data: unknown) { updates.push(data); return value; },
      then(resolve: (data: unknown) => void) { resolve({ error: null, data: table === 'profiles' ? [{ id: 'alice', push_tokens: { '60000000-0000-4000-8000-000000000001': registration } }] : [] }); } };
    return value;
  };
  const client = { from: query, rpc: async () => { const first = !claimed; claimed = true; return { data: first, error: null }; } } as unknown as SupabaseClient;
  const gym = { slug: 'werblin', status: 'available', baseline: 20, stale: false, checkedAt: now.toISOString() } as GymBaseline;
  let baselines = [gym];
  const fetcher = (async (_input, init) => { sends++; assert.equal(JSON.parse(init!.body as string).data.kind, 'gym'); return new Response(JSON.stringify({ data: { status: 'ok', id: 'ticket' } })); }) as typeof fetch;
  const run = createNotificationWorker(client, async () => baselines, fetcher, () => now);
  assert.equal((await run()).delivered, 1); assert.equal((await run()).delivered, 0); assert.equal(sends, 1);
  assert.ok(updates.some(data => (data as { ticket_id?: string }).ticket_id === 'ticket'));
  claimed = false; baselines = [{ ...gym, stale: true }]; assert.equal((await run()).delivered, 0); assert.equal(sends, 1);
});
test('worker removes invalid receipt tokens with compare-and-delete RPC', async () => {
  const rpcs: unknown[] = [];
  const row = { user_id: 'alice', installation_id: 'installation', gym_slug: 'werblin', ticket_id: 'ticket', expo_token: 'ExpoPushToken[old]', ticket_created_at: '2026-09-08T15:00:00Z' };
  const query = () => { let updating = false; const q = { select() { return q; }, eq() { return q; }, lt() { return q; }, order() { return q; }, limit() { return q; }, update() { updating = true; return q; }, then(resolve: (v: unknown) => void) { resolve({ error: null, data: updating ? [] : [row] }); } }; return q; };
  const client = { from: query, rpc: async (name: string, args: unknown) => { rpcs.push({ name, args }); return { error: null }; } } as unknown as SupabaseClient;
  const run = createNotificationWorker(client, async () => [], (async () => new Response(JSON.stringify({ data: { ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } } } }))) as typeof fetch, () => now);
  await run(); assert.deepEqual(rpcs, [{ name: 'remove_invalid_push_token', args: { p_user: 'alice', p_installation: 'installation', p_token: 'ExpoPushToken[old]' } }]);
});
