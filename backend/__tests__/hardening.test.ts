import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createCachedLoader, type CacheEntry, type ResponseCache } from '../cache';
import { createApp } from '../server';
import express from 'express';
import { apiErrors, structuredLimit } from '../http';

test('cache coalesces concurrent requests, honors TTL, serves stale on failure and cools down', async () => {
  let now = 1000; let entry: CacheEntry<unknown> | null = null; let calls = 0;
  const cache = { get: async () => entry, set: async (_key: string, value: CacheEntry<unknown>) => { entry = value; } } as ResponseCache;
  const load = createCachedLoader(cache, () => now);
  const upstream = async () => { calls++; return ['menu']; };
  const values = await Promise.all([load('menu', upstream, 100, 1000), load('menu', upstream, 100, 1000)]);
  assert.equal(calls, 1); assert.deepEqual(values[0].value, ['menu']);
  now = 1099; await load('menu', upstream); assert.equal(calls, 1);
  now = 1101; const fail = async (): Promise<string[]> => { calls++; throw new Error('timeout'); };
  assert.equal((await load('menu', fail)).stale, true); assert.equal(calls, 2);
  await load('menu', fail); assert.equal(calls, 2);
  now = 2200; await assert.rejects(load('menu', fail), /cooling/);
  now = 32000; assert.equal((await load('menu', upstream)).stale, false);
});
test('cache outages never prevent a live response', async () => {
  const cache: ResponseCache = { get: async () => { throw new Error('Redis down'); }, set: async () => { throw new Error('Redis down'); } };
  assert.equal((await createCachedLoader(cache)('key', async () => 42)).value, 42);
});
test('root and health share a bounded database probe; failures expose no internal diagnostics', async t => {
  for (const available of [true, false]) {
    let calls = 0; const server = createApp({ pingDatabase: async () => { calls++; return available; } }).listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const path of ['/', '/health']) {
      const response = await fetch(origin + path); const body = await response.json(); assert.equal(response.status, available ? 200 : 503);
      assert.equal(body.database, available ? 'ok' : 'unavailable'); assert.ok(Number.isInteger(body.uptimeSeconds)); assert.ok(response.headers.get('x-request-id'));
    }
    assert.equal(calls, 1); const unknown = await fetch(origin + '/missing'); assert.equal((await unknown.json()).error.code, 'NOT_FOUND');
  }
});
test('rate limits return structured 429 and Retry-After; malformed JSON is sanitized', async t => {
  const app = express(); app.post('/limited', structuredLimit({ limit: 1 }), (_req, res) => { res.json({ ok: true }); });
  app.post('/json', express.json(), (_req, res) => { res.json({ ok: true }); }); app.use(apiErrors);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await fetch(origin + '/limited', { method: 'POST' }); const limited = await fetch(origin + '/limited', { method: 'POST' });
  assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after')); assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
  const invalid = await fetch(origin + '/json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{private' });
  assert.equal(invalid.status, 400); assert.ok(!(await invalid.text()).includes('private'));
});

test('a partial gym outage keeps that venue stale while another venue refreshes', async t => {
  const { createCampusProxyRouter } = await import('../campus-proxy');
  const { GYMS } = await import('../../src/types/facilities');
  const entries = new Map<string, CacheEntry<unknown>>(); let stale = false; let calls = 0;
  const cache = { get: async (key: string) => { const value = entries.get(key); return value ? { ...value, freshUntil: stale ? 0 : value.freshUntil } : null; },
    set: async (key: string, value: CacheEntry<unknown>) => { entries.set(key, value); } } as ResponseCache;
  const app = express().use('/campus', createCampusProxyRouter({ cache, authenticate: async () => 'alice', baselines: async () => {
    calls++; return GYMS.map(g => ({ slug: g.slug, baseline: stale && g.slug === 'werblin' ? null : stale ? 70 : 40,
      status: stale && g.slug === 'werblin' ? 'unavailable' : 'available', checkedAt: new Date().toISOString() }));
  } }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/campus/gyms`;
  const options = { headers: { Authorization: 'Bearer fixture' } };
  assert.equal((await fetch(url, options)).status, 200); stale = true;
  const result = await (await fetch(url, options)).json(); assert.equal(calls, 2);
  assert.equal(result[0].baseline, 40); assert.equal(result[0].stale, true); assert.equal(result[1].baseline, 70); assert.equal(result[1].stale, false);
});
