import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, test } from 'node:test';

import { createApp } from '../server';

const original = process.env.TRUST_PROXY;
afterEach(() => { if (original === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = original; });
const trustOf = (value?: string) => {
  if (value === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = value;
  return createApp({ pingDatabase: async () => true }).get('trust proxy');
};

test('one proxy is trusted by default, and TRUST_PROXY still overrides it', () => {
  // Render puts exactly one proxy in front. Trusting none made express-rate-limit refuse to key
  // a limit on an address it could not believe, which is the production 502.
  assert.equal(trustOf(undefined), 1);
  assert.equal(trustOf('  '), 1);
  assert.equal(trustOf('2'), 2, 'a different hop count is honoured');
  assert.equal(trustOf('false'), false, 'and so is having no proxy at all');
  assert.equal(trustOf('none'), false);
  assert.deepEqual(trustOf('10.0.0.0/8, 172.16.0.0/12'), ['10.0.0.0/8', '172.16.0.0/12'], 'exact subnets stay exact');
  // Never `true`: that reads the first X-Forwarded-For entry, which the caller writes, so a
  // per-IP limit would be keyed on a value the caller chooses.
  assert.notEqual(trustOf(undefined), true);
});

test('a forwarded request is rate-limited without the limiter rejecting the address', async t => {
  delete process.env.TRUST_PROXY;
  const complaints: unknown[] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => { complaints.push(args); };
  t.after(() => { console.error = consoleError; });

  const server = createApp({ pingDatabase: async () => true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const health = await fetch(`${base}/health`, { headers: { 'X-Forwarded-For': '203.0.113.7' } });
  assert.equal(health.status, 200);
  // The route still reaches its own auth check rather than dying in the limiter.
  const vision = await fetch(`${base}/api/vision`, { method: 'POST', headers: { 'X-Forwarded-For': '203.0.113.7' } });
  assert.equal(vision.status, 401);

  const flagged = complaints.flat().filter(entry => String((entry as { code?: string })?.code ?? entry).includes('ERR_ERL_UNEXPECTED_X_FORWARDED_FOR'));
  assert.deepEqual(flagged, [], 'the forwarded address is believed, so nothing complains about it');
});
