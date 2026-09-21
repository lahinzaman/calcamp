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
let pickerResult: unknown = { canceled: true, assets: null };
const pickerCalls: unknown[] = [];
mock.module('expo-image-picker', { namedExports: {
  launchImageLibraryAsync: async (options: unknown) => { pickerCalls.push(options); return pickerResult; },
} });
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

/** The Camera element the scanner renders, with whatever props it was given this render. */
const cameraProps = () => view!.root.findByType('Camera' as React.ElementType).props as {
  barcodeScannerSettings?: { barcodeTypes: string[] };
  onBarcodeScanned?: (result: unknown) => void;
  onCameraReady?: () => void;
  autofocus?: 'on' | 'off';
};

const read = async (data: string) => act(async () => cameraProps().onBarcodeScanned?.({
  type: 'ean13', data, bounds: { origin: { x: 10, y: 10 }, size: { width: 120, height: 70 } } }));

test('a code is accepted only once two frames agree on it', async () => {
  const seen: string[] = [];
  await act(async () => { view = create(<CameraScanner mode="barcode" busy={false}
    onBarcode={code => seen.push(code)} onCapture={() => {}} onClose={() => {}} onManual={() => {}} />); });

  // One frame is not enough: a single decode can be wrong at an angle or across a curved can,
  // and accepting it outright is how a real, different product gets looked up confidently.
  await read('012000161155');
  assert.deepEqual(seen, []);
  await read('012000161155');
  assert.deepEqual(seen, ['012000161155']);
});

test('frames that disagree never accumulate into an acceptance', async () => {
  const seen: string[] = [];
  await act(async () => { view = create(<CameraScanner mode="barcode" busy={false}
    onBarcode={code => seen.push(code)} onCapture={() => {}} onClose={() => {}} onManual={() => {}} />); });
  // Both are valid codes; neither is read twice, so neither is what is in front of the camera.
  await read('012000161155');
  await read('036000291452');
  await read('012000161155');
  assert.deepEqual(seen, [], 'agreement has to be consecutive, not merely eventual');
  await read('012000161155');
  assert.deepEqual(seen, ['012000161155']);
});

test('a frame that fails its own check digit is ignored rather than looked up', async () => {
  const seen: string[] = [];
  await act(async () => { view = create(<CameraScanner mode="barcode" busy={false}
    onBarcode={code => seen.push(code)} onCapture={() => {}} onClose={() => {}} onManual={() => {}} />); });

  // A misread almost always breaks the check digit — that is the whole point of carrying one.
  // Twice over, so it is not merely the agreement rule swallowing it.
  await read('012000161156');
  await read('012000161156');
  assert.deepEqual(seen, [], 'a corrupt read is dropped and scanning simply continues');

  // Nothing about the scanner is stuck afterwards: a good code still goes through.
  await read('012000161155');
  await read('012000161155');
  assert.deepEqual(seen, ['012000161155']);
});

test('only the symbologies a food package carries are scanned for', async () => {
  await act(async () => { view = create(<CameraScanner mode="barcode" busy={false}
    onBarcode={() => {}} onCapture={() => {}} onClose={() => {}} onManual={() => {}} />); });
  await act(async () => cameraProps().onCameraReady?.());
  const types = cameraProps().barcodeScannerSettings!.barcodeTypes;
  // code128 is a logistics symbology printed on shipping labels, never a food GTIN. Scanning
  // for it only added ways to decode something that was not the product code.
  assert.ok(!types.includes('code128'));
  assert.deepEqual(types, ['ean13', 'ean8', 'upc_a', 'upc_e']);
});

test('the full set of barcode types is requested once the session is actually running', async () => {
  await act(async () => { view = create(<CameraScanner mode="barcode" busy={false}
    onBarcode={() => {}} onCapture={() => {}} onClose={() => {}} onManual={() => {}} />); });

  // expo-camera filters the types it will scan for against the metadata output's
  // availableMetadataObjectTypes, which is empty until the output is attached to a running
  // session. Asking for everything up front is how that filter keeps nothing at all, and the
  // native side only reconfigures when the requested set *changes* — so it never recovers.
  const before = cameraProps().barcodeScannerSettings!.barcodeTypes;
  await act(async () => cameraProps().onCameraReady?.());
  const after = cameraProps().barcodeScannerSettings!.barcodeTypes;

  assert.notDeepEqual(before, after, 'the set has to change after ready, or nothing reconfigures');
  assert.deepEqual(after, ['ean13', 'ean8', 'upc_a', 'upc_e']);
  for (const type of before) assert.ok(after.includes(type), 'the initial set stays scannable throughout');
});

test('a preview that scans nothing says so instead of pulsing forever', async () => {
  await act(async () => { view = create(<CameraScanner mode="barcode" busy={false} scanTimeoutMs={40}
    onBarcode={() => {}} onCapture={() => {}} onClose={() => {}} onManual={() => {}} />); });
  await act(async () => cameraProps().onCameraReady?.());
  assert.ok(!JSON.stringify(view!.toJSON()).includes('Nothing is scanning'));

  // A live preview that has detected nothing for the whole window is scanning being
  // unavailable, which used to be indistinguishable from "hold it steadier" and had no way out.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
  assert.ok(JSON.stringify(view!.toJSON()).includes('Nothing is scanning'));
  assert.ok(JSON.stringify(view!.toJSON()).includes('type the number printed under it'),
    'and it points at the way through rather than just reporting failure');

  // A scan landing afterwards clears it: the scanner was slow, not dead.
  await act(async () => cameraProps().onBarcodeScanned?.({ type: 'ean13', data: '012000161155' }));
  assert.ok(!JSON.stringify(view!.toJSON()).includes('Nothing is scanning'));
});

test('tapping the preview runs a fresh focus pass and then lets go of it', async () => {
  await act(async () => { view = create(<CameraScanner mode="barcode" busy={false}
    onBarcode={() => {}} onCapture={() => {}} onClose={() => {}} onManual={() => {}} />); });
  // expo-camera exposes the focus mode and nothing else, so 'on' is focus-once-then-lock and
  // 'off' is continuous. Continuous is what hunts on a barcode held close.
  assert.equal(cameraProps().autofocus, 'off');

  const target = view!.root.findByProps({ accessibilityLabel: 'Tap to focus' });
  // A tap before the preview is ready cannot focus anything, and must not leave it locked.
  await act(async () => target.props.onPress({ nativeEvent: { locationX: 100, locationY: 200 } }));
  assert.equal(cameraProps().autofocus, 'off');

  await act(async () => cameraProps().onCameraReady?.());
  await act(async () => target.props.onPress({ nativeEvent: { locationX: 100, locationY: 200 } }));
  // Released first, then engaged a tick later: React would collapse an off-then-on in one
  // commit into no change at all, and the native side only acts on a change.
  assert.equal(cameraProps().autofocus, 'off');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 90)); });
  assert.equal(cameraProps().autofocus, 'on', 'the pass runs and the focus is held');
  assert.ok(JSON.stringify(view!.toJSON()).includes('76'), 'and the tap is acknowledged on screen');
});

test('a photo already taken can be used instead of a new one, except for barcodes', async () => {
  const uris: string[] = [];
  await act(async () => { view = create(<CameraScanner mode="label" busy={false}
    onBarcode={() => {}} onCapture={() => {}} onCaptureUri={uri => uris.push(uri)}
    onClose={() => {}} onManual={() => {}} />); });

  pickerCalls.length = 0;
  pickerResult = { canceled: false, assets: [{ uri: 'file:///library/label.jpg' }] };
  await act(async () => { await view!.root.findByProps({ accessibilityLabel: 'Choose an existing photo' }).props.onPress(); });
  assert.deepEqual(uris, ['file:///library/label.jpg'], 'it reaches the same handler the shutter feeds');
  // Label and treadmill read text off a file, so they ask for a URI at full quality.
  assert.deepEqual(pickerCalls[0], { mediaTypes: 'images', quality: 1, base64: false, allowsMultipleSelection: false });

  // Cancelling changes nothing at all.
  pickerResult = { canceled: true, assets: null };
  await act(async () => { await view!.root.findByProps({ accessibilityLabel: 'Choose an existing photo' }).props.onPress(); });
  assert.deepEqual(uris, ['file:///library/label.jpg']);

  // A barcode is read from the live frame; a still of one is just a photo of a number.
  await act(async () => { view!.update(<CameraScanner mode="barcode" busy={false}
    onBarcode={() => {}} onCapture={() => {}} onClose={() => {}} onManual={() => {}} />); });
  assert.equal(view!.root.findAllByProps({ accessibilityLabel: 'Choose an existing photo' }).length, 0);
});

test('a meal photo from the library arrives as base64, the way the shutter delivers it', async () => {
  const shots: string[] = [];
  await act(async () => { view = create(<CameraScanner mode="photo" busy={false}
    onBarcode={() => {}} onCapture={base64 => shots.push(base64)} onClose={() => {}} onManual={() => {}} />); });
  pickerCalls.length = 0;
  pickerResult = { canceled: false, assets: [{ uri: 'file:///library/plate.jpg', base64: '/9j/meal' }] };
  await act(async () => { await view!.root.findByProps({ accessibilityLabel: 'Choose an existing photo' }).props.onPress(); });
  assert.deepEqual(shots, ['/9j/meal']);
  assert.equal((pickerCalls[0] as { base64: boolean }).base64, true);
});
