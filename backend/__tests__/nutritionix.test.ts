import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import express from 'express';

import { createBrandedSearchRouter, parseInstantBranded, type BrandedSearchOptions } from '../nutritionix';

/** A trimmed instant response, in the shape Nutritionix actually returns. */
const instant = {
  common: [{ food_name: 'burrito bowl' }],
  branded: [
    { food_name: 'Chicken Burrito Bowl', brand_name: 'Chipotle', serving_qty: 1, serving_unit: 'bowl',
      serving_weight_grams: 510, nf_calories: 625, nix_item_id: 'abc123', photo: { thumb: 'https://img/1.jpg' } },
    { food_name: 'Chips', brand_name: 'Chipotle', serving_qty: 4, serving_unit: 'oz',
      nf_calories: 540, nix_item_id: 'def456', photo: { thumb: 'https://img/2.jpg' } },
  ],
};

async function serve(t: TestContext, options: BrandedSearchOptions) {
  const app = express();
  app.use('/api/search-branded', createBrandedSearchRouter({
    authenticate: async token => token === 'session' ? 'alice' : null,
    credentials: () => ({ appId: 'app-id', apiKey: 'app-key' }), ...options }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/search-branded`;
}
const get = (url: string, query = 'chipotle', token = 'session') =>
  fetch(`${url}?query=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` } });

test('branded suggestions keep the brand and the item apart, and claim no macros they were not given', async t => {
  let sent: string | undefined; let headers: Headers | undefined;
  const url = await serve(t, { fetchImpl: async (input, init) => {
    sent = String(input); headers = new Headers(init?.headers);
    return Response.json(instant);
  } });
  const response = await get(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');

  assert.ok(sent!.startsWith('https://trackapi.nutritionix.com/v2/search/instant?'));
  assert.ok(sent!.includes('query=chipotle'));
  assert.equal(headers!.get('x-app-id'), 'app-id');
  assert.equal(headers!.get('x-app-key'), 'app-key');

  const { items } = await response.json() as { items: ReturnType<typeof parseInstantBranded> };
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    key: 'nutritionix:abc123', brandName: 'Chipotle', itemName: 'Chicken Burrito Bowl',
    servingQty: 1, servingUnit: 'bowl', servingWeightGrams: 510, caloriesKcal: 625,
    // Instant search publishes calories and nothing else. A row that arrived with zeros here
    // would read as a burrito bowl containing no protein.
    macros: null, needsNutrients: true, nixItemId: 'abc123', photoUrl: 'https://img/1.jpg',
  });
  // A weight the brand did not publish stays null rather than becoming zero grams.
  assert.equal(items[1].servingWeightGrams, null);
  // The common array is a different kind of food and never mixes into branded results.
  assert.ok(!items.some(item => item.itemName === 'burrito bowl'));
});

test('a row that cannot name its brand or item is dropped, and duplicates collapse', () => {
  assert.equal(parseInstantBranded({ branded: [{ food_name: 'Chips' }] }).length, 0, 'no brand');
  assert.equal(parseInstantBranded({ branded: [{ brand_name: 'Chipotle' }] }).length, 0, 'no item');
  assert.equal(parseInstantBranded({ branded: [
    { food_name: 'Chips', brand_name: 'Chipotle', nix_item_id: 'x' },
    { food_name: 'Chips', brand_name: 'Chipotle', nix_item_id: 'x' }] }).length, 1);
  assert.deepEqual(parseInstantBranded({}), []);
  assert.deepEqual(parseInstantBranded(null), []);
  // A nonsense calorie figure is unknown, not a number to log against someone's day.
  assert.equal(parseInstantBranded({ branded: [{ food_name: 'A', brand_name: 'B', nf_calories: -5 }] })[0].caloriesKcal, null);
  assert.equal(parseInstantBranded({ branded: [{ food_name: 'A', brand_name: 'B', nf_calories: 'lots' }] })[0].caloriesKcal, null);
});

test('an upstream refusal is classified, never swallowed into one generic failure', async t => {
  const refuse = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  // Nutritionix rejecting the app id or key is a deployment problem, not something to retry.
  const badKey = await serve(t, { fetchImpl: refuse(401, { message: 'unauthorized', id: 'unauthorized' }) as unknown as typeof fetch });
  const keyAnswer = await get(badKey);
  assert.equal(keyAnswer.status, 503);
  assert.equal((await keyAnswer.json() as { error: { code: string } }).error.code, 'NOT_CONFIGURED');

  const missing = await serve(t, { fetchImpl: refuse(404, { message: 'not found' }) as unknown as typeof fetch });
  assert.equal((await (await get(missing)).json() as { error: { code: string } }).error.code, 'UPSTREAM_NOT_FOUND');

  const throttled = await serve(t, { fetchImpl: refuse(429, { message: 'usage limits exceeded' }) as unknown as typeof fetch });
  assert.equal((await get(throttled)).status, 429);

  const down = await serve(t, { fetchImpl: refuse(503, { message: 'service unavailable' }) as unknown as typeof fetch });
  assert.equal((await get(down)).status, 502);

  const slow = await serve(t, { timeoutMs: 10, fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort')), { once: true })) });
  assert.equal((await get(slow)).status, 504);
});

test('an unsigned caller, an empty query and missing credentials never reach Nutritionix', async t => {
  const url = await serve(t, { fetchImpl: async () => assert.fail('Nutritionix was called') });
  assert.equal((await get(url, 'chipotle', 'expired')).status, 401);
  assert.equal((await fetch(url)).status, 401, 'no bearer at all');
  assert.equal((await get(url, '   ')).status, 400);
  assert.equal((await get(url, 'x'.repeat(250))).status, 400);

  const unconfigured = await serve(t, { credentials: () => ({}), fetchImpl: async () => assert.fail('Nutritionix was called') });
  const answer = await get(unconfigured);
  assert.equal(answer.status, 503);
  assert.equal((await answer.json() as { error: { code: string } }).error.code, 'NOT_CONFIGURED');
});
