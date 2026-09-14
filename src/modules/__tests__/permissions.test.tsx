import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { reanimatedMock } from './support/reanimated';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: true });

let granted = false; let canAskAgain = true; let cameraAsks = 0;
let configured: { enabled: boolean; request: boolean } | null = null; let notificationsFail = false;
let actuallyGranted = false;
mock.module('nativewind', { namedExports: { cssInterop: () => {}, vars: (v: unknown) => v } });
mock.module('react-native-reanimated', reanimatedMock);
mock.module('react-native', { namedExports: {
  View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView',
  StyleSheet: { create: (v: Record<string, unknown>) => v, absoluteFill: {} }, Platform: { OS: 'ios', select: () => undefined },
} });
mock.module('expo-camera', { namedExports: {
  useCameraPermissions: () => [{ granted, canAskAgain }, async () => { cameraAsks++; return { granted, canAskAgain }; }] } });
mock.module('../notifications/service', { namedExports: {
  configureNotifications: async (_owner: string, preferences: { enabled: boolean }, _profile: unknown, request: boolean) => {
    if (notificationsFail) throw new Error('denied');
    configured = { enabled: preferences.enabled, request };
  },
  notificationsGranted: async () => actuallyGranted } });
mock.module('../notifications/preferences', { namedExports: { readPreferences: () => ({}), savePreferences: () => {} } });
mock.module('../../store/authStore', { namedExports: {
  useAuthStore: (select: (state: unknown) => unknown) => select({ session: { user: { id: 'alice' } } }) } });

const { PermissionsCard } = require('../onboarding/PermissionsCard') as typeof import('../onboarding/PermissionsCard');

let view: ReactTestRenderer | undefined;
const text = () => JSON.stringify(view!.toJSON());
const press = async (label: string) => { await act(async () => view!.root.findByProps({ accessibilityLabel: label }).props.onPress()); };
afterEach(async () => {
  await act(async () => view?.unmount()); view = undefined;
  granted = false; canAskAgain = true; cameraAsks = 0; configured = null; notificationsFail = false; actuallyGranted = false;
});
const render = async () => { await act(async () => { view = create(<PermissionsCard />); }); };

test('the app asks for camera and notifications, having first said what they are for', async () => {
  await render();
  assert.ok(text().includes('progress photos'), 'the camera row says why');
  assert.ok(text().includes('weigh-in reminders'), 'the notification row says why');
  await press('Allow camera');
  assert.equal(cameraAsks, 1);
  await press('Allow notifications');
  // Turning the master switch on is what makes the system dialog appear at all.
  assert.deepEqual(configured, { enabled: true, request: true });
});

test('a permission already granted is reported, not asked for again', async () => {
  granted = true;
  await render();
  assert.ok(text().includes('On'));
  assert.equal(view!.root.findAllByProps({ accessibilityLabel: 'Allow camera' }).length, 0);
});

test('a refusal is recoverable and points at device settings', async () => {
  notificationsFail = true;
  await render();
  await press('Allow notifications');
  assert.ok(text().includes('device Settings'));
  await press('Allow notifications');
  assert.ok(text().includes('device Settings'), 'asking again is still offered');
});

test('push registration failing on a simulator is not reported as the person refusing', async () => {
  // configureNotifications throws once local reminders are scheduled but push cannot register.
  // The permission was granted; saying "declined" sends people to Settings to fix nothing.
  notificationsFail = true; actuallyGranted = true;
  await render();
  await press('Allow notifications');
  assert.ok(text().includes('On'), 'the row reports the permission it actually holds');
  assert.ok(!text().includes('device Settings'));
});

test('a camera request that resolves without granting says so instead of looking inert', async () => {
  await render();
  await press('Allow camera');
  assert.equal(cameraAsks, 1);
  // canAskAgain is still true, so nothing used to change on screen and the button looked dead.
  assert.ok(text().includes('device Settings'));
});

test('the app says plainly that it never wants the microphone', async () => {
  await render();
  assert.ok(text().includes('never asks for your microphone'));
});
