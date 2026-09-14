import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import express from 'express';
import { createRecipeProxyRouter, htmlToText, normalizeRecipe, type RecipeProxyOptions } from '../recipe-proxy';
import { assertPublicUrl, isPrivateAddress, fetchPublicHtml, UnsafeUrl } from '../safe-fetch';

const recipe = {
  title: 'Sunday chili', servings: 6, note: null,
  ingredients: [
    { name: 'beef, ground, cooked', grams: 900, macros: { caloriesKcal: 2151, proteinG: 234, carbsG: 0, fatG: 126 } },
    { name: 'beans, kidney, canned', grams: 800, macros: { caloriesKcal: 680, proteinG: 44, carbsG: 120, fatG: 4 } },
  ],
};
const reply = (payload: unknown) => Response.json({ id: 'resp_1', output_text: JSON.stringify(payload) });
const page = '<html><body><h1>Sunday chili</h1><p>' + 'A slow chili worth the afternoon. '.repeat(20) + '</p></body></html>';
/** Every name resolves to a public address unless a test says otherwise. */
const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];

async function serve(t: TestContext, options: RecipeProxyOptions) {
  const app = express();
  app.use('/api/recipe', createRecipeProxyRouter({ authenticate: async token => token === 'session' ? 'alice' : null,
    apiKey: () => 'server-secret', resolver: publicDns as never, ...options }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/recipe`;
}
const post = (url: string, body: unknown = { url: 'https://example.com/chili' }, token = 'session') =>
  fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('a recipe page becomes ingredients with whole-recipe gram weights', async t => {
  let sent: Record<string, unknown> | undefined;
  const url = await serve(t, {
    fetchImpl: async () => new Response(page, { headers: { 'content-type': 'text/html' } }),
    openAiFetch: async (_input, init) => { sent = JSON.parse(String(init?.body)); return reply(recipe); },
  });
  const response = await post(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), recipe);
  assert.equal((sent!.text as { format: { strict: boolean; name: string } }).format.strict, true);
  assert.equal((sent!.text as { format: { name: string } }).format.name, 'recipe');
  // The page's words reach the model; its markup does not.
  const text = (sent!.input as [{ content: [{ text: string }] }])[0].content[0].text;
  assert.ok(text.includes('Sunday chili') && !text.includes('<h1>'));
});

test('the server will not fetch an address only the server can reach', async t => {
  for (const address of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '172.16.0.1', '100.64.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  for (const address of ['93.184.216.34', '8.8.8.8', '2606:2800::1']) assert.equal(isPrivateAddress(address), false, address);

  await assert.rejects(assertPublicUrl('file:///etc/passwd'), UnsafeUrl);
  await assert.rejects(assertPublicUrl('http://localhost/admin'), UnsafeUrl);
  await assert.rejects(assertPublicUrl('https://user:pw@example.com/'), UnsafeUrl);
  await assert.rejects(assertPublicUrl('http://169.254.169.254/latest/meta-data/'), UnsafeUrl);
  // A name that resolves into the private range is the same attack wearing a public hostname.
  await assert.rejects(assertPublicUrl('https://sneaky.example', (async () => [{ address: '10.1.2.3', family: 4 }]) as never), UnsafeUrl);
  assert.equal((await assertPublicUrl('https://example.com/x', publicDns as never)).hostname, 'example.com');

  // A redirect is a second address, and gets checked like the first.
  await assert.rejects(fetchPublicHtml('https://example.com/a', {
    resolver: publicDns as never,
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
  }), UnsafeUrl);

  const url = await serve(t, { fetchImpl: async () => assert.fail('the page was fetched') });
  assert.equal((await post(url, { url: 'http://localhost:3000/admin' })).status, 400);
});

test('bad sessions, bad bodies and a missing key never fetch or reach the provider', async t => {
  const url = await serve(t, { fetchImpl: async () => assert.fail('fetched'), openAiFetch: async () => assert.fail('called') });
  assert.equal((await post(url, { url: 'https://example.com/x' }, 'expired')).status, 401);
  assert.equal((await post(url, {})).status, 400);
  assert.equal((await post(url, { url: 'x'.repeat(3000) })).status, 400);
  const unconfigured = await serve(t, { apiKey: () => undefined, fetchImpl: async () => assert.fail('fetched') });
  assert.equal((await post(unconfigured)).status, 503);
});

test('a page with no recipe on it fails as one, and never as a recipe of nothing', async t => {
  const thin = await serve(t, { fetchImpl: async () => new Response('<html><body>Hi</body></html>', { headers: { 'content-type': 'text/html' } }) });
  assert.equal((await post(thin)).status, 422);

  const empty = await serve(t, {
    fetchImpl: async () => new Response(page, { headers: { 'content-type': 'text/html' } }),
    openAiFetch: async () => reply({ title: 'Not a recipe', servings: 1, ingredients: [], note: null }),
  });
  assert.equal((await post(empty)).status, 502);

  const slow = await serve(t, { timeoutMs: 10,
    fetchImpl: async () => new Response(page, { headers: { 'content-type': 'text/html' } }),
    openAiFetch: async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort')), { once: true })) });
  assert.equal((await post(slow)).status, 504);
});

test('normalization drops a partial ingredient rather than completing it with zeros', () => {
  const [beef] = recipe.ingredients;
  assert.equal(normalizeRecipe({ ...recipe, ingredients: [beef, { ...beef, grams: 0 }] }).ingredients.length, 1);
  assert.equal(normalizeRecipe({ ...recipe, ingredients: [beef, { ...beef, macros: { caloriesKcal: 10, proteinG: 1, carbsG: 2 } }] }).ingredients.length, 1);
  assert.equal(normalizeRecipe({ ...recipe, servings: 0 }).servings, 1, 'a yield of nothing is one serving, not a divide by zero');
  assert.equal(normalizeRecipe({ ...recipe, title: '  ' }).title, 'Imported recipe');
  assert.throws(() => normalizeRecipe({ ...recipe, ingredients: [] }));
});

test('structured recipe data survives the tag stripping that removes every other script', () => {
  const html = `<html><head>
    <script>window.tracker = 1;</script>
    <script type="application/ld+json">{"@type":"Recipe","recipeYield":"6 servings"}</script>
    <style>.a{color:red}</style></head>
    <body><h1>Chili</h1><ul><li>900&nbsp;g beef</li></ul><!-- hidden --></body></html>`;
  const text = htmlToText(html);
  assert.ok(text.includes('"recipeYield":"6 servings"'), 'schema.org data is the page saying it plainly');
  assert.ok(!text.includes('window.tracker') && !text.includes('color:red') && !text.includes('hidden'));
  assert.ok(text.includes('900 g beef'), 'entities decode and list items keep their words');
  assert.ok(!text.includes('<'));
});
