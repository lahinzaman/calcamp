import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import express from 'express';
import { createVisionProxyRouter, normalizeLogMeal, type VisionProxyOptions } from '../vision-proxy';
const validImage = { image: { mimeType: 'image/jpeg', base64: Buffer.from([255,216,255,224,1,2,3,4]).toString('base64') } };
const nutrient = (quantity: number, unit = 'g') => ({ quantity, unit });
const nutrition = { hasNutritionalInfo: true, serving_size: 200, ids: [1], nutritional_info: {
  totalNutrients: { ENERC_KCAL: nutrient(300, 'kcal'), PROCNT: nutrient(20), CHOCDF: nutrient(30), FAT: nutrient(11) },
} };
async function serve(t: TestContext, options: VisionProxyOptions) {
  const app = express(); app.use('/api/vision', createVisionProxyRouter({ authenticate: async token => token === 'session' ? 'alice' : null, tokenForUser: () => 'server-secret', ...options }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/vision`;
}
const post = (url: string, body: unknown = validImage, token = 'session') => fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test('vision proxy authenticates, keeps provider tokens server-side, and normalizes portion totals', async t => {
  const calls: string[] = [];
  const url = await serve(t, { fetchImpl: async (input, init) => {
    calls.push(String(input)); assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer server-secret');
    if (calls.length === 1) { assert.ok(init?.body instanceof FormData); return Response.json({ imageId: 123 }); }
    assert.deepEqual(JSON.parse(String(init?.body)), { imageId: 123 }); return Response.json(nutrition);
  } });
  const response = await post(url);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { portion_size_grams: 200, macros: { caloriesKcal: 300, proteinG: 20, carbsG: 30, fatG: 11 } });
  assert.equal(calls.length, 2); assert.ok(calls.every(url => url.startsWith('https://api.logmeal.com/v2/')));
});
test('invalid sessions, image bytes, and absent account tokens never reach LogMeal', async t => {
  const url = await serve(t, { fetchImpl: async () => assert.fail('Unexpected provider request') });
  assert.equal((await post(url, validImage, 'expired')).status, 401);
  assert.equal((await post(url, { image: { base64: 'dGVzdA==', mimeType: 'image/jpeg' } })).status, 400);
  const unconfigured = await serve(t, { tokenForUser: () => undefined, fetchImpl: async () => assert.fail('Unexpected provider request') });
  assert.equal((await post(unconfigured)).status, 503);
});
test('provider failures are sanitized, bounded, and never converted into fabricated zero macros', async t => {
  const url = await serve(t, { fetchImpl: async () => { throw new Error('server-secret'); } });
  const response = await post(url); assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('server-secret'));
  const slow = await serve(t, { timeoutMs: 10, fetchImpl: async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort')), { once: true })) });
  assert.equal((await post(slow)).status, 504);
  assert.throws(() => normalizeLogMeal({ ...nutrition, serving_size: undefined }));
  assert.throws(() => normalizeLogMeal({ ...nutrition, ids: [1, null] }));
  assert.throws(() => normalizeLogMeal({ ...nutrition, nutritional_info: { totalNutrients: {} } }));
});
