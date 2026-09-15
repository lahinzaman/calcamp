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

test('the reading moves while waiting but never claims a milestone the work has not reached', async () => {
  await act(async () => { view = create(<Probe />); });
  assert.equal(hook.value, 0);

  await act(async () => hook.begin());
  await tick(500);
  const creeping = hook.value;
  // It moves, so a slow model does not look like a frozen app...
  assert.ok(creeping > 0, 'the reading advances while the request is in flight');
  // ...but it stays under the first real milestone, because nothing has happened yet.
  assert.ok(creeping < 0.08, `crept to ${creeping}, past the first milestone`);

  // A milestone the work actually reached moves it, and it keeps creeping toward the next.
  await act(async () => hook.reach(0.45));
  const atMilestone = hook.value;
  assert.ok(atMilestone > creeping, 'reaching a milestone advances the reading');
  await tick(500);
  assert.ok(hook.value > atMilestone && hook.value < 0.45 + 0.001, 'it eases toward the milestone without overshooting');

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

test('a failed scan returns the reading to nothing rather than leaving it stranded', async () => {
  await act(async () => { view = create(<Probe />); });
  await act(async () => { hook.begin(); hook.reach(0.8); });
  assert.ok(hook.value > 0);
  await act(async () => hook.reset());
  assert.equal(hook.value, 0);
  await tick(400);
  assert.equal(hook.value, 0, 'and it does not start creeping again on its own');
});
