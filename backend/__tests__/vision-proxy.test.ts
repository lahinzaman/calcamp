import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import express from 'express';
import { createVisionProxyRouter, decodeRequest, normalizeVision, type VisionProxyOptions } from '../vision-proxy';

const jpeg = Buffer.from([255, 216, 255, 224, 1, 2, 3, 4]).toString('base64');
const angle = { mimeType: 'image/jpeg', base64: jpeg };
const meal = {
  items: [
    { name: 'Grilled chicken breast', grams: 140, confidence: 0.86, macros: { caloriesKcal: 231, proteinG: 43.5, carbsG: 0, fatG: 5 } },
    { name: 'White rice, cooked', grams: 200, confidence: 0.6, macros: { caloriesKcal: 260, proteinG: 5.4, carbsG: 56, fatG: 0.6 } },
  ],
  note: 'The sauce under the rice could not be identified.',
};
/** Stands in for the Responses API: only `output_text` is read, so only it has to be real. */
const reply = (payload: unknown) => Response.json({ id: 'resp_1', output_text: JSON.stringify(payload) });

async function serve(t: TestContext, options: VisionProxyOptions) {
  const app = express();
  app.use('/api/vision', createVisionProxyRouter({
    authenticate: async token => token === 'session' ? 'alice' : null, apiKey: () => 'server-secret', ...options }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/vision`;
}
const post = (url: string, body: unknown = { images: [angle] }, token = 'session') =>
  fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('the proxy sends every angle and the note under one server-side key, and returns items', async t => {
  let sent: Record<string, unknown> | undefined;
  let authorization: string | null = null;
  const url = await serve(t, { fetchImpl: async (input, init) => {
    assert.match(String(input), /^https:\/\/api\.openai\.com\//);
    authorization = new Headers(init?.headers).get('authorization');
    sent = JSON.parse(String(init?.body));
    return reply(meal);
  } });
  const response = await post(url, { images: [angle, angle, angle], note: 'Half of the rice was left.' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), meal);
  assert.equal(authorization, 'Bearer server-secret');

  const content = (sent!.input as [{ content: { type: string; text?: string }[] }])[0].content;
  assert.equal(content.filter(block => block.type === 'input_image').length, 3, 'every angle reaches the model');
  assert.deepEqual(content.filter(block => block.type === 'input_text').map(block => block.text),
    ['Angle 1:', 'Angle 2:', 'Angle 3:', 'The person who ate this adds: Half of the rice was left.']);
  // The angles are labelled and the correction comes last, so it reads against the photos.
  assert.equal(content.at(-1)!.type, 'input_text');
  assert.equal((sent!.text as { format: { strict: boolean } }).format.strict, true);
});

test('a single-image body from an older build is still accepted', async t => {
  const url = await serve(t, { fetchImpl: async () => reply(meal) });
  const response = await post(url, { image: angle });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).items.length, 2);
});

test('invalid sessions, bad bytes, too many angles, and a missing key never reach the provider', async t => {
  const url = await serve(t, { fetchImpl: async () => assert.fail('Unexpected provider request') });
  assert.equal((await post(url, { images: [angle] }, 'expired')).status, 401);
  assert.equal((await post(url, { images: [{ base64: 'dGVzdA==', mimeType: 'image/jpeg' }] })).status, 400);
  assert.equal((await post(url, { images: [] })).status, 400);
  assert.equal((await post(url, { images: [angle, angle, angle, angle, angle] })).status, 400, 'five angles is past the cap');
  assert.equal((await post(url, { images: [angle], note: { text: 'no' } })).status, 400);
  const unconfigured = await serve(t, { apiKey: () => undefined, fetchImpl: async () => assert.fail('Unexpected provider request') });
  assert.equal((await post(unconfigured)).status, 503);
});

test('provider failures are sanitized and bounded, and never become a fabricated empty meal', async t => {
  const url = await serve(t, { fetchImpl: async () => { throw new Error('server-secret'); } });
  const failed = await post(url);
  assert.equal(failed.status, 502); assert.ok(!(await failed.text()).includes('server-secret'));

  // An answer with no usable row is a failed recognition, not a meal of zero calories.
  const empty = await serve(t, { fetchImpl: async () => reply({ items: [], note: null }) });
  assert.equal((await post(empty)).status, 502);

  const slow = await serve(t, { timeoutMs: 10, fetchImpl: async (_input, init) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort')), { once: true })) });
  assert.equal((await post(slow)).status, 504);
});

test('normalization drops incomplete rows rather than completing them with zeros', () => {
  const [chicken] = meal.items;
  assert.equal(normalizeVision({ items: [chicken, { ...chicken, grams: 0 }], note: null }).items.length, 1);
  assert.equal(normalizeVision({ items: [chicken, { ...chicken, name: '  ' }], note: null }).items.length, 1);
  assert.equal(normalizeVision({ items: [chicken, { ...chicken, macros: { caloriesKcal: 10, proteinG: 1, carbsG: 2 } }], note: null }).items.length, 1);
  assert.equal(normalizeVision({ items: [{ ...chicken, confidence: 9 }], note: null }).items[0].confidence, 0, 'an out-of-range confidence is unknown, not high');
  assert.equal(normalizeVision({ items: [chicken], note: '   ' }).note, null);
  assert.throws(() => normalizeVision({ items: [] }));
  assert.throws(() => normalizeVision({ note: 'no items key' }));
});

test('the request decoder bounds the angle count and the note length', () => {
  assert.equal(decodeRequest({ images: [angle, angle] }).images.length, 2);
  assert.equal(decodeRequest({ images: [angle] }).note, null);
  assert.equal(decodeRequest({ images: [angle], note: 'x'.repeat(900) }).note!.length, 500);
  assert.throws(() => decodeRequest({ images: [angle, angle, angle, angle, angle] }));
  assert.throws(() => decodeRequest({}));
});
