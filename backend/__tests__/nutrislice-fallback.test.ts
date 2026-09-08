import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';

import express from 'express';

import { NutrisliceError } from '../../src/api/nutrislice';
import {
  createNutrisliceFallbackRouter,
  type NutrisliceFallbackOptions,
} from '../nutrislice-fallback';

async function serve(t: TestContext, options: NutrisliceFallbackOptions) {
  const app = express();
  app.use('/api/nutrislice', createNutrisliceFallbackRouter(options));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/api/nutrislice/daily-menu`;
}

test('returns the shared daily menu with public CORS and a bounded success cache', async (t) => {
  let calls = 0;
  const url = await serve(t, {
    fetchMenu: async (hall, date, options) => {
      calls += 1;
      assert.equal(hall, 'busch-dining-hall');
      assert.equal(date, '2026-09-08');
      assert.ok(options?.signal instanceof AbortSignal);
      assert.equal(options?.fallbackBaseUrl, undefined, 'proxy must never recurse');
      return [];
    },
  });
  const response = await fetch(`${url}?diningHall=busch-dining-hall&date=2026-09-08`, {
    headers: { Origin: 'https://rulocked.example' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
  assert.deepEqual(await response.json(), []);
  assert.equal(calls, 1);
});

test('rejects unsupported halls, repeated inputs, and impossible dates before upstream fetch', async (t) => {
  const url = await serve(t, {
    fetchMenu: async () => assert.fail('Invalid input reached upstream'),
  });
  for (const query of [
    'diningHall=https://attacker.example&date=2026-09-08',
    'diningHall=busch-dining-hall&date=2026-02-30',
    'diningHall=busch-dining-hall&date=2026-9-8',
    'diningHall=busch-dining-hall',
    'diningHall=busch-dining-hall&date=2026-09-08&date=2026-09-09',
  ]) {
    const response = await fetch(`${url}?${query}`);
    assert.equal(response.status, 400, query);
    assert.equal((await response.json()).error.code, 'INVALID_INPUT');
  }
});

test('preflight responds without calling Rutgers', async (t) => {
  const url = await serve(t, {
    fetchMenu: async () => assert.fail('Preflight must not fetch menus'),
  });
  const response = await fetch(url, {
    method: 'OPTIONS',
    headers: { Origin: 'https://rulocked.example', 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET');
});

test('upstream errors have gateway status and are never returned as empty menus', async (t) => {
  for (const [code, expectedStatus] of [
    ['UPSTREAM_HTTP', 502],
    ['INVALID_RESPONSE', 502],
    ['TIMEOUT', 504],
    ['NETWORK', 502],
  ] as const) {
    const url = await serve(t, {
      fetchMenu: async () => {
        throw new NutrisliceError(code, 'Private upstream diagnostics');
      },
    });
    const response = await fetch(`${url}?diningHall=the-atrium&date=2026-09-08`);
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.equal(body.error.fallback.kind, 'rescue-catalog');
    assert.equal(body.error.fallback.availabilityVerified, false);
    assert.ok(body.error.fallback.meals.every((meal: { sourceUrl: string }) => meal.sourceUrl.startsWith('https://')));
    assert.equal(body.error.message, 'Rutgers menu data is unavailable.');
  }
});

test('unexpected errors return a sanitized server error', async (t) => {
  const url = await serve(t, {
    fetchMenu: async () => {
      throw new Error('Internal server details');
    },
  });
  const response = await fetch(`${url}?diningHall=the-atrium&date=2026-09-08`);
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.equal(body.error.message, 'Unable to load the daily menu.');
  assert.equal(body.error.fallback.availabilityVerified, false);
  assert.ok(body.error.fallback.meals.length > 0);
});
