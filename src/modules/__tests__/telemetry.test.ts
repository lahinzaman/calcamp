import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { ReactNativeOptions } from '@sentry/react-native';
mock.module('expo-updates', { namedExports: { updateId: null, channel: null, runtimeVersion: null } });
let options: ReactNativeOptions;
mock.module('@sentry/react-native', { namedExports: { init: (value: ReactNativeOptions) => { options = value; }, wrap: (component: unknown) => component } });
test('empty Sentry DSN safely disables native capture and scrubs personal error payloads', async () => {
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  await import('../telemetry/sentry');
  assert.equal(options.enabled, false); assert.equal(options.enableNative, false); assert.equal(options.sendDefaultPii, false);
  assert.equal(options.beforeBreadcrumb!({ category: 'http', data: { url: 'private' } }, {}), null);
  assert.ok(options.beforeBreadcrumb!({ category: 'rulocked.sync.queued', data: { count: 2 } }, {}));
  const event = await options.beforeSend!({ type: undefined, user: { email: 'private@example.com' }, request: { url: 'https://private' }, extra: { health: 100 },
    exception: { values: [{ value: 'private food entry', stacktrace: { frames: [{ filename: 'app.js?token=private', vars: { weight: 80 } }] } }] } }, {});
  assert.ok(event); assert.equal(event.user, undefined); assert.equal(event.request, undefined); assert.equal(event.extra, undefined);
  assert.equal(event.exception!.values![0].value, 'Application exception');
  assert.equal(event.exception!.values![0].stacktrace!.frames![0].filename, 'app.js');
  assert.equal(event.exception!.values![0].stacktrace!.frames![0].vars, undefined);
});
