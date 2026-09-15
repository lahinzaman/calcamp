import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { reanimatedMock } from './support/reanimated';
import { svgMock } from './support/svg';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: true });
mock.module('nativewind', { namedExports: { cssInterop: () => {}, vars: (v: unknown) => v } });
mock.module('react-native-reanimated', reanimatedMock);
mock.module('react-native-svg', svgMock);
mock.module('react-native', { namedExports: {
  View: 'View', Text: 'Text', StyleSheet: { create: (v: Record<string, unknown>) => v, flatten: (v: unknown) => v ?? {}, absoluteFill: {} },
  Platform: { OS: 'ios', select: () => undefined }, TextInput: 'TextInput',
} });

const { useScanProgress } = require('../../components/ScanProgress') as typeof import('../../components/ScanProgress');

let view: ReactTestRenderer | undefined;
let hook!: ReturnType<typeof useScanProgress>;
function Probe() { hook = useScanProgress(); return null; }
afterEach(async () => { await act(async () => view?.unmount()); view = undefined; });

const tick = async (ms: number) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };

test('a reached milestone is shown as reached, and only finishing shows 100%', async () => {
  await act(async () => { view = create(<Probe />); });
  assert.equal(hook.value, 0);

  await act(async () => hook.begin());
  await tick(500);
  const creeping = hook.value;
  // It moves, so a slow model does not look like a frozen app...
  assert.ok(creeping > 0, 'the reading advances while the request is in flight');
  // ...but stays low, because nothing has actually happened yet.
  assert.ok(creeping < 0.1, `crept to ${creeping} before any milestone`);

  // A milestone reads as the milestone. Showing a fraction of it — which this used to do —
  // left a fast scan sitting near half and then jumping to done.
  await act(async () => hook.reach(0.8));
  assert.ok(Math.abs(hook.value - 0.8) < 1e-9, `showed ${hook.value} on reaching 0.8`);

  // Then it drifts on toward what comes next, so a wait after a milestone still moves.
  await tick(500);
  assert.ok(hook.value > 0.8, 'the reading keeps moving past a milestone while it waits');
  assert.ok(hook.value < 0.97, 'but never drifts to completion on its own');

  // Nothing ever reads backwards, even if an earlier milestone arrives late.
  const before = hook.value;
  await act(async () => hook.reach(0.1));
  assert.ok(hook.value >= before, 'a late, lower milestone cannot rewind the reading');

  await act(async () => hook.done());
  assert.equal(hook.value, 1);
  // And the ticking stops with it, rather than running on behind a finished scan.
  await tick(400);
  assert.equal(hook.value, 1);
});

test('the milestone schedule climbs smoothly instead of stalling then snapping', async () => {
  await act(async () => { view = create(<Probe />); });
  await act(async () => hook.begin());
  const seen: number[] = [];
  // The real order a photo scan reports: encoded, sent, answered, parsed, matched, done.
  for (const milestone of [0.12, 0.45, 0.8, 0.9, 0.94]) {
    await act(async () => hook.reach(milestone));
    seen.push(hook.value);
  }
  assert.deepEqual(seen.map(v => Math.round(v * 100)), [12, 45, 80, 90, 94]);
  // The gap left for the final jump is small; it used to be a leap from about half.
  await act(async () => hook.done());
  assert.equal(hook.value, 1);
});

test('a failed scan returns the reading to nothing rather than leaving it stranded', async () => {
  await act(async () => { view = create(<Probe />); });
  await act(async () => { hook.begin(); hook.reach(0.8); });
  assert.ok(hook.value > 0);
  await act(async () => hook.reset());
  assert.equal(hook.value, 0);
  await tick(400);
  assert.equal(hook.value, 0, 'and it does not start creeping again on its own');
});
