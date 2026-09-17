import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { reanimatedMock } from './support/reanimated';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: true });

/** Every event in order, so the test can see what happened while the prompt was still open. */
const timeline: string[] = [];
let prompted: 'will-show' | 'already-answered' | 'unknown' = 'will-show';
let initialized = false;

mock.module('nativewind', { namedExports: { cssInterop: () => {}, vars: (v: unknown) => v } });
mock.module('react-native-reanimated', reanimatedMock);
mock.module('react-native-safe-area-context', { namedExports: { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) } });
mock.module('react-native', { namedExports: {
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', TextInput: 'TextInput',
  Modal: (props: { visible: boolean; children: React.ReactNode }) => { timeline.push(`modal:${props.visible ? 'open' : 'closed'}`); return props.visible ? React.createElement('Modal', null, props.children) : null; },
  StyleSheet: { create: (v: Record<string, unknown>) => v, flatten: (v: unknown) => v ?? {}, absoluteFill: {} },
  Platform: { OS: 'ios', select: () => undefined },
} });
mock.module('../health/useHealthSync', { namedExports: {
  useHealthSync: () => ({
    steps: null, activeEnergyKcal: null, status: 'idle', error: null, refreshedAt: null, initialized,
    refresh: async () => {},
    permissionPrompt: async () => { timeline.push('check'); return prompted; },
    initialize: async () => { timeline.push('request'); initialized = true; },
  }),
} });

const { HealthConnectCard } = require('../health/HealthConnectCard') as typeof import('../health/HealthConnectCard');

let view: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => view?.unmount()); view = undefined; timeline.length = 0; prompted = 'will-show'; initialized = false; });
const text = () => JSON.stringify(view!.toJSON());
const press = async (label: string) => {
  const target = view!.root.findAll(node => node.type === ('Pressable' as React.ElementType)
    && node.findAll(child => child.type === ('Text' as React.ElementType) && child.props.children === label).length > 0)[0];
  assert.ok(target, `no button labelled ${label}`);
  await act(async () => { await target.props.onPress(); });
};

test('the Apple Health sheet is requested while the prompt is still open, not as it closes', async () => {
  await act(async () => { view = create(<HealthConnectCard />); });
  await act(async () => view!.root.findByProps({ accessibilityLabel: 'Connect or refresh health' }).props.onPress());
  timeline.length = 0;
  await press('Continue to permissions');

  // The race this guards against: closing the prompt and requesting at once let iOS drop the
  // Health sheet, so the request never answered and the button read "Connecting…" for good.
  const requestedAt = timeline.indexOf('request');
  const closedAt = timeline.indexOf('modal:closed');
  assert.ok(requestedAt >= 0, 'authorization was requested');
  assert.ok(closedAt === -1 || closedAt > requestedAt, `the prompt closed before the request: ${timeline.join(' → ')}`);
  assert.ok(timeline.indexOf('check') < requestedAt, 'whether a sheet will show is checked first');
});

test('when iOS already has an answer, the screen says so instead of looking broken', async () => {
  prompted = 'already-answered';
  await act(async () => { view = create(<HealthConnectCard />); });
  await act(async () => view!.root.findByProps({ accessibilityLabel: 'Connect or refresh health' }).props.onPress());
  await press('Continue to permissions');

  // No sheet will appear. Saying why — and where to change it — is the whole difference
  // between a working connection and one that looks like it failed.
  assert.ok(text().includes('will not show the permission sheet again'));
  assert.ok(text().includes('Data Access'), 'it points at where the answer can be changed');
  // It stays up to be read rather than vanishing the moment the check returns.
  assert.ok(text().includes('Done'));
});
