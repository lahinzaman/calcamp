import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import express from 'express';

import { createBrandedSearchRouter, parseFoodDescription, parseFoodsSearch, type BrandedSearchOptions } from '../fatsecret';
import { createTokenManager } from '../fatsecret-token';

const brandRow = (id: string, brand: string, name: string, description: string) =>
  ({ food_id: id, food_name: name, brand_name: brand, food_type: 'Brand', food_description: description });
const BOWL = brandRow('1', 'Chipotle', 'Chicken Burrito Bowl', 'Per 1 serving - Calories: 625kcal | Fat: 21.50g | Carbs: 63.00g | Protein: 45.00g');
const search = { foods: { food: [BOWL, brandRow('2', 'Chipotle', 'Chips', 'Per 4 oz - Calories: 540kcal | Fat: 25.00g | Carbs: 73.00g | Protein: 7.00g')] } };

const token = (body: unknown = { access_token: 'tok', expires_in: 86400 }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function serve(t: TestContext, options: BrandedSearchOptions) {
  const app = express();
  app.use('/api/search-branded', createBrandedSearchRouter({
    authenticate: async bearer => bearer === 'session' ? 'alice' : null,
    credentials: () => ({ clientId: 'id', clientSecret: 'secret' }),
    fetchImpl: async () => token(), ...options }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/search-branded`;
}
const get = (url: string, query = 'chipotle', bearer = 'session') =>
  fetch(`${url}?query=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${bearer}` } });

test('a description becomes macros by label, never by position', () => {
  const parsed = parseFoodDescription('Per 1 serving - Calories: 300kcal | Fat: 13.00g | Carbs: 32.00g | Protein: 15.00g')!;
  assert.equal(parsed.servingLabel, '1 serving');
  assert.deepEqual(parsed.macros, { caloriesKcal: 300, proteinG: 15, carbsG: 32, fatG: 13 });
  // Generic rows are measured per 100g; carrying that label is what stops a threefold error.
  assert.equal(parseFoodDescription('Per 100g - Calories: 22kcal | Fat: 0.34g | Carbs: 3.28g | Protein: 3.09g')!.servingLabel, '100g');
  // Reordered or extended descriptions still read correctly.
  assert.deepEqual(parseFoodDescription('Per 1 cup - Protein: 8.00g | Calories: 120kcal | Carbs: 12.00g | Fat: 4.50g | Fiber: 2.00g')!.macros,
    { caloriesKcal: 120, proteinG: 8, carbsG: 12, fatG: 4.5 });
  // A description missing any of the four is unusable, not a food with none of that macro.
  assert.equal(parseFoodDescription('Per 1 serving - Calories: 300kcal | Fat: 13.00g | Carbs: 32.00g'), null);
  assert.equal(parseFoodDescription('a burrito'), null);
});

test('a single hit comes back as an object, and is still one result', () => {
  // FatSecret drops the array when exactly one food matches. Treating that as an array is how a
  // single-hit search silently returns nothing.
  assert.equal(parseFoodsSearch({ foods: { food: BOWL } }).length, 1);
  assert.equal(parseFoodsSearch({ foods: { food: [BOWL, BOWL] } }).length, 1, 'the same food twice is one row');
  assert.deepEqual(parseFoodsSearch({ foods: {} }), []);
  assert.deepEqual(parseFoodsSearch({}), []);
  // Generic foods belong under USDA, not under a restaurants heading.
  assert.deepEqual(parseFoodsSearch({ foods: { food: { food_id: '9', food_name: 'Apple', food_type: 'Generic',
    food_description: 'Per 100g - Calories: 52kcal | Fat: 0.20g | Carbs: 14.00g | Protein: 0.30g' } } }), []);
});

test('the search carries a bearer token and maps the brand apart from the item', async t => {
  const calls: string[] = [];
  const url = await serve(t, {
    fetchImpl: async input => { calls.push(String(input)); return token(); },
    searchFetch: async (input, init) => {
      calls.push(String(input));
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer tok');
      return Response.json(search);
    },
  });
  const response = await get(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { items } = await response.json() as { items: BrandedSuggestionShape[] };
  assert.deepEqual(items[0], { key: 'fatsecret:1', brandName: 'Chipotle', itemName: 'Chicken Burrito Bowl',
    servingLabel: '1 serving', macros: { caloriesKcal: 625, proteinG: 45, carbsG: 63, fatG: 21.5 }, foodId: '1' });
  assert.ok(calls[0].startsWith('https://oauth.fatsecret.com/connect/token'));
  assert.ok(calls[1].includes('method=foods.search') && calls[1].includes('search_expression=chipotle'));
});
type BrandedSuggestionShape = ReturnType<typeof parseFoodsSearch>[number];

test('the token is fetched once and reused until it is close to expiring', async () => {
  let issued = 0; let clock = 0;
  const tokens = createTokenManager({
    credentials: () => ({ clientId: 'id', clientSecret: 'secret' }), now: () => clock,
    fetchImpl: async () => { issued++; return token({ access_token: `tok-${issued}`, expires_in: 3600 }); },
  });
  assert.equal(await tokens.token(), 'tok-1');
  assert.equal(await tokens.token(), 'tok-1');
  assert.equal(issued, 1, 'a cached token is not re-fetched');

  // Ten searches arriving together share one refresh rather than asking for ten tokens.
  clock = 3_600_000;
  const together = await Promise.all(Array.from({ length: 10 }, () => tokens.token()));
  assert.deepEqual(new Set(together), new Set(['tok-2']));
  assert.equal(issued, 2);

  // It renews before the stated expiry, so a token cannot lapse between the check and the call.
  clock += 3_600_000 - 60_000;
  await tokens.token();
  assert.equal(issued, 3);
});

test('a rejected token is refreshed once, and a wrong credential is not retried forever', async t => {
  let issued = 0; let searches = 0;
  const url = await serve(t, {
    fetchImpl: async () => { issued++; return token({ access_token: `tok-${issued}`, expires_in: 86400 }); },
    searchFetch: async (_input, init) => {
      searches++;
      // The first token is rejected; the retry carries a fresh one and succeeds.
      if (new Headers(init?.headers).get('authorization') === 'Bearer tok-1') return new Response('{}', { status: 401 });
      return Response.json(search);
    },
  });
  assert.equal((await get(url)).status, 200);
  assert.equal(issued, 2, 'the rejected token was replaced');
  assert.equal(searches, 2, 'and the search was retried exactly once');

  const badCredentials = await serve(t, {
    fetchImpl: async () => token({ error: 'invalid_client', error_description: 'bad client' }, 401),
    searchFetch: async () => assert.fail('the search ran without a token'),
  });
  const answer = await get(badCredentials);
  assert.equal(answer.status, 503);
  assert.equal((await answer.json() as { error: { code: string } }).error.code, 'NOT_CONFIGURED');
});

test('upstream refusals are classified, including the ones FatSecret sends with HTTP 200', async t => {
  const refuse = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const throttled = await serve(t, { searchFetch: refuse(429, { error: { message: 'too many requests', code: 13 } }) as unknown as typeof fetch });
  assert.equal((await get(throttled)).status, 429);
  const down = await serve(t, { searchFetch: refuse(503, { error: { message: 'unavailable' } }) as unknown as typeof fetch });
  assert.equal((await get(down)).status, 502);
  const missing = await serve(t, { searchFetch: refuse(404, { error: { message: 'no such method' } }) as unknown as typeof fetch });
  assert.equal((await (await get(missing)).json() as { error: { code: string } }).error.code, 'UPSTREAM_NOT_FOUND');

  // A 200 carrying an error object is still a failure, not an empty result list.
  const quiet = await serve(t, { searchFetch: (async () => Response.json({ error: { code: 12, message: 'Missing required oauth parameter' } })) as unknown as typeof fetch });
  assert.equal((await get(quiet)).status, 502);

  const slow = await serve(t, { searchTimeoutMs: 10,
    searchFetch: async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort')), { once: true })) });
  assert.equal((await get(slow)).status, 504);
});

test('an unsigned caller and an empty query never reach FatSecret', async t => {
  const url = await serve(t, { searchFetch: async () => assert.fail('FatSecret was called') });
  assert.equal((await get(url, 'chipotle', 'expired')).status, 401);
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await get(url, '   ')).status, 400);
  assert.equal((await get(url, 'x'.repeat(250))).status, 400);
});
