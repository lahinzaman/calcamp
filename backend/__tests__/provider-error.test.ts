import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import express from 'express';

import { describeProviderFailure, redactSecrets } from '../provider-error';
import { routeLabel } from '../http';
import { createVisionProxyRouter } from '../vision-proxy';

const jpeg = Buffer.from([255, 216, 255, 224, 1, 2, 3, 4]).toString('base64');
const openAiError = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function post(t: TestContext, status: number, body: unknown) {
  const app = express();
  app.use('/api/vision', createVisionProxyRouter({ authenticate: async () => 'alice', apiKey: () => 'sk-test-key-value',
    fetchImpl: async () => openAiError(status, body) }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/vision`, { method: 'POST',
    headers: { Authorization: 'Bearer s', 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: [{ base64: jpeg, mimeType: 'image/jpeg' }] }) });
  return { status: response.status, body: await response.json() as { error: { code: string; message: string } } };
}

test('a rejected key and a wrong model are told apart from a provider that is merely down', async t => {
  // All four used to answer 502 RECOGNITION_FAILED, so a deploy that would never work looked
  // exactly like a bad photo.
  const key = await post(t, 401, { error: { message: 'Incorrect API key provided: sk-test-key-value', code: 'invalid_api_key' } });
  assert.equal(key.status, 503); assert.equal(key.body.error.code, 'NOT_CONFIGURED');

  const model = await post(t, 404, { error: { message: "The model 'gpt-5.6-terra' does not exist or you do not have access to it.", code: 'model_not_found' } });
  assert.equal(model.status, 503); assert.equal(model.body.error.code, 'MODEL_UNAVAILABLE');

  const quota = await post(t, 429, { error: { message: 'You exceeded your current quota.', code: 'insufficient_quota' } });
  assert.equal(quota.status, 429); assert.equal(quota.body.error.code, 'RATE_LIMITED');

  const down = await post(t, 503, { error: { message: 'The server is overloaded.', type: 'server_error' } });
  assert.equal(down.status, 502); assert.equal(down.body.error.code, 'PROVIDER_DOWN');

  // Nothing about our configuration reaches the caller — not the key, not the model name.
  for (const answer of [key, model, quota, down]) {
    assert.ok(!answer.body.error.message.includes('sk-'), answer.body.error.message);
    assert.ok(!answer.body.error.message.includes('gpt-'), answer.body.error.message);
  }
});

test('a credential the provider quotes back is not written into the deployment log', () => {
  // OpenAI answers a bad key by repeating it. Logging that verbatim puts the key somewhere it
  // outlives the request and anyone with dashboard access can read it.
  assert.equal(redactSecrets('Incorrect API key provided: sk-test-key-value'), 'Incorrect API key provided: sk-***');
  assert.equal(redactSecrets('use Bearer eyJhbGciOi.JIUzI1NiIs-_x'), 'use Bearer ***');
  assert.equal(redactSecrets('api_live_abcdefghijk failed'), 'api-*** failed');
  assert.equal(redactSecrets('no secret here'), 'no secret here');
});

test('an aborted call reads as a timeout rather than a provider fault', () => {
  assert.equal(describeProviderFailure(new Error('whatever'), true).status, 504);
  assert.equal(describeProviderFailure(new Error('whatever'), true).code, 'TIMEOUT');
  // Anything unrecognised stays a provider failure rather than being reported as a bad setup.
  assert.equal(describeProviderFailure(new Error('socket hang up'), false).code, 'PROVIDER_FAILED');
});

test('a log line names the API that answered, not the router-relative slash', () => {
  // Every proxy mounts its handler at '/', so the log said '/' for all of them and a 502 could
  // not be traced to the route that produced it.
  assert.equal(routeLabel({ baseUrl: '/api/vision', path: '/', route: { path: '/' } }), '/api/vision');
  assert.equal(routeLabel({ baseUrl: '/api/recipe', path: '/', route: { path: '/' } }), '/api/recipe');
  assert.equal(routeLabel({ baseUrl: '', path: '/health', route: { path: ['/', '/health'] } }), '/health');
  assert.equal(routeLabel({ baseUrl: '', path: '/', route: { path: ['/', '/health'] } }), '/');
  assert.equal(routeLabel({ baseUrl: '', path: '/nope' }), 'unmatched');
});
