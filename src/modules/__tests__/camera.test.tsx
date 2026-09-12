import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { reanimatedMock } from './support/reanimated';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: true });

const appState = { currentState: 'active' as string, addEventListener: () => ({ remove() {} }) };
let granted = true;
mock.module('nativewind', { namedExports: { cssInterop: () => {}, vars: (v: unknown) => v } });
mock.module('react-native-reanimated', reanimatedMock);
mock.module('react-native', { namedExports: {
  View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', Modal: 'Modal',
  ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios', select: () => undefined },
  StyleSheet: { create: (v: Record<string, unknown>) => v, absoluteFill: { position: 'absolute' } },
  Linking: { openSettings: async () => {} }, AppState: appState,
} });
mock.module('react-native-safe-area-context', { namedExports: {
  SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) } });
mock.module('expo-camera', { namedExports: {
  CameraView: React.forwardRef((props: unknown, ref) => {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: async () => ({ base64: '/9j/4AECAwQ=' }) }));
    return React.createElement('Camera', props as object);
  }),
  useCameraPermissions: () => [{ granted, canAskAgain: true }, async () => {}],
} });

const { CameraScanner, webCameraProblem } = require('../quickActions/CameraScanner') as typeof import('../quickActions/CameraScanner');
let view: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => view?.unmount()); view = undefined; appState.currentState = 'active'; granted = true; });

const render = async () => {
  await act(async () => { view = create(<CameraScanner mode="barcode" busy={false}
    onBarcode={() => {}} onCapture={() => {}} onClose={() => {}} onManual={() => {}} />); });
};
/** Every View that sits over the whole screen, with its style flattened. */
function overlays(node: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const walk = (value: any) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const style = [value.props?.style].flat(3).filter(Boolean) as Record<string, unknown>[];
    const flat = Object.assign({}, ...style) as Record<string, unknown>;
    if (value.type === 'View' && flat.position === 'absolute' && flat.justifyContent === 'space-between') found.push(flat);
    walk(value.children);
  };
  walk(node);
  return found;
}

test('the camera chrome never paints over the preview it sits on', async () => {
  await render();
  const chrome = overlays(view!.toJSON());
  assert.equal(chrome.length, 1, 'expected exactly one full-screen chrome overlay');
  // A themed SafeAreaView here would fill the screen with an opaque colour and the preview
  // would look like a blank screen with the buttons floating on it.
  assert.equal(chrome[0].backgroundColor, undefined);
  assert.equal(chrome[0].paddingTop, 55, 'safe-area padding is applied directly, not by a themed wrapper');
  assert.equal(view!.root.findAllByType('Camera' as React.ElementType).length, 1);
});

test('a modal transition does not leave the preview unmounted', async () => {
  // iOS reports 'inactive' while a modal presents and while the permission alert is up.
  appState.currentState = 'inactive';
  await render();
  assert.equal(view!.root.findAllByType('Camera' as React.ElementType).length, 1);
  await act(async () => view!.unmount());
  appState.currentState = 'background';
  await render();
  assert.equal(view!.root.findAllByType('Camera' as React.ElementType).length, 0, 'a real background trip still releases the camera');
});

test('without permission the camera is not mounted at all', async () => {
  granted = false;
  await render();
  assert.equal(view!.root.findAllByType('Camera' as React.ElementType).length, 0);
  assert.ok(JSON.stringify(view!.toJSON()).includes('Camera access'));
});

test('a browser that cannot hand out a camera says so instead of showing black', () => {
  const scope = globalThis as unknown as { isSecureContext?: boolean };
  // Native never reports a browser problem, whatever the surrounding globals say.
  scope.isSecureContext = false;
  assert.equal(webCameraProblem(), null);
  delete scope.isSecureContext;
});
