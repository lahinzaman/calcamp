import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { reanimatedMock } from './support/reanimated';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: true });

/** Every focus callback registered, so a test can simulate returning to the screen. */
const focusCallbacks: (() => void)[] = [];
let sessionOwner: string | undefined;
mock.module('nativewind', { namedExports: { cssInterop: () => {}, vars: (v: unknown) => v } });
mock.module('react-native-reanimated', reanimatedMock);
mock.module('react-native', { namedExports: {
  View: 'View', Text: 'Text', Pressable: 'Pressable', Image: 'Image', ScrollView: 'ScrollView',
  StyleSheet: { create: (v: Record<string, unknown>) => v, absoluteFill: {} }, Platform: { OS: 'ios', select: () => undefined },
} });
mock.module('expo-router', { namedExports: {
  useFocusEffect: (callback: () => void) => { focusCallbacks.push(callback); React.useEffect(callback, [callback]); },
} });
// The card only borrows Card for its frame; the charts it otherwise drags in need react-native
// internals these component mocks do not provide.
mock.module('../insights/AnalyticsCards', { namedExports: {
  Card: ({ children }: { children: React.ReactNode }) => React.createElement('Card', null, children),
} });
mock.module('../../i18n', { namedExports: { useT: () => (key: string) => key, t: (key: string) => key } });
mock.module('../../theme/Pressable', { namedExports: { Pressable: 'Pressable' } });
mock.module('../../theme/primitives', { namedExports: { Text: 'Text' } });
mock.module('../../theme/haptics', { namedExports: { haptic: () => {} } });
mock.module('../../store/authStore', { namedExports: {
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ session: sessionOwner ? { user: { id: sessionOwner } } : null }),
} });

const { ProgressPhotoCard } = require('../progress/ProgressPhotoCard') as typeof import('../progress/ProgressPhotoCard');
const { addPhotos } = require('../progress/photos') as typeof import('../progress/photos');

let view: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => view?.unmount()); view = undefined; focusCallbacks.length = 0; sessionOwner = undefined; });

const photo = (id: string) => ({ id, uri: `file:///${id}.jpg`, takenAtMs: Date.UTC(2026, 8, 19), weightLbs: 180 });

test('a photo taken after the screen first mounted still shows when you come back to it', async () => {
  // Trends is a tab: it mounts at app start, before the session has loaded. The card used to
  // read once, under 'anonymous', find nothing, return null, and never look again.
  sessionOwner = undefined;
  await act(async () => { view = create(<ProgressPhotoCard index={0} />); });
  assert.equal(view!.toJSON(), null, 'nothing to show yet, correctly');

  // The account arrives, and a weigh-in photo is saved under the real id.
  sessionOwner = 'alice';
  addPhotos('alice', '2026-09-19', [photo('p1')]);
  await act(async () => { for (const callback of [...focusCallbacks]) callback(); });
  assert.ok(JSON.stringify(view!.toJSON()).includes('file:///p1.jpg'),
    'returning to the screen re-reads, so the photo appears');
});

test('photos are read against the signed-in account, not whoever was there at mount', async () => {
  // Distinct accounts, because the durable store persists across tests just as it does on device.
  addPhotos('bob', '2026-09-19', [photo('bob-1')]);
  sessionOwner = 'carol';
  await act(async () => { view = create(<ProgressPhotoCard index={0} />); });
  assert.equal(view!.toJSON(), null, 'another account’s photos are not shown');

  sessionOwner = 'bob';
  await act(async () => { view!.update(<ProgressPhotoCard index={0} />); });
  assert.ok(JSON.stringify(view!.toJSON()).includes('file:///bob-1.jpg'));
});
