import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from 'expo-camera';
import Animated, { FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Action } from '../../components/FormControls';
import { TIMING } from '../../theme/motion';
import { haptic } from '../../theme/haptics';
import { t as translate } from '../../i18n';
import { breadcrumb } from '../telemetry/events';
import { normalizeBarcode } from './gtin';

export type ScannerMode = 'photo' | 'barcode' | 'label';
/** A preview that has not started by now is not going to without being told why. */
const READY_TIMEOUT_MS = 6000;
/**
 * A running preview that has detected nothing for this long is not going to. Distinct from
 * READY_TIMEOUT_MS, which only catches a preview that never starts: scanning can be dead while
 * the preview is perfectly alive, and that used to leave a pulsing reticle and no way forward.
 */
const SCAN_TIMEOUT_MS = 12_000;
/**
 * Hoisted, and applied in two stages on purpose.
 *
 * expo-camera adds its AVCaptureMetadataOutput and then immediately reads
 * `availableMetadataObjectTypes` to filter what it will scan for. That list is only populated
 * once the output is attached to a running session — read too early it is empty, so the filter
 * keeps nothing and `metadataObjectTypes` is set to []. Nothing is scanned after that, silently,
 * and the only thing that retries is a *change* to the requested types.
 *
 * So the full set is requested once the camera reports ready. That is a real change to the type
 * set arriving while the session is live, which makes the library configure the output again
 * against a populated list. Passing the same array identity every render would not do it: the
 * native side short-circuits when the set is unchanged.
 */
/**
 * The symbologies a retail food package actually carries. `code128` used to be in here and is
 * not: it is a variable-length logistics symbology used on shipping labels, no food GTIN is
 * printed in it, and scanning for it alongside EAN/UPC only adds ways to decode something that
 * is not the product code.
 */
const SCAN_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e'];
const INITIAL_SCAN_SETTINGS: { barcodeTypes: BarcodeType[] } = { barcodeTypes: ['ean13'] };
const READY_SCAN_SETTINGS: { barcodeTypes: BarcodeType[] } = { barcodeTypes: SCAN_TYPES };
/**
 * How many frames must agree before a code is accepted.
 *
 * A single frame can decode wrongly — at an angle, under glare, across a curved can — and the
 * old behaviour accepted the first result outright, played a success haptic and looked it up.
 * A misread that happens to carry a valid check digit is a different real product, confidently
 * wrong. Two agreeing reads cost a fraction of a second and remove nearly all of that.
 */
const AGREEING_READS = 2;
/**
 * Browsers hand out a camera only in a secure context. Reaching a dev server over a LAN
 * address is the usual way to end up here, and it looks identical to a broken camera.
 */
export function webCameraProblem(): string | null {
  if (Platform.OS !== 'web' || typeof globalThis === 'undefined') return null;
  const scope = globalThis as unknown as { isSecureContext?: boolean; navigator?: { mediaDevices?: unknown } };
  if (scope.isSecureContext === false) return 'This browser only allows camera access over HTTPS or on localhost. Open the app over HTTPS, or enter this item by hand.';
  if (scope.navigator && !scope.navigator.mediaDevices) return 'This browser will not give the page a camera. Try a different browser, or enter this item by hand.';
  return null;
}
interface Highlight { x: number; y: number; width: number; height: number; data: string }
/** Bounds are sometimes an empty rect; a zero-area box would draw in the corner. */
function toHighlight(result: BarcodeScanningResult): Highlight | null {
  const { origin, size } = result.bounds ?? {};
  if (!origin || !size || size.width <= 1 || size.height <= 1) return null;
  return { x: origin.x, y: origin.y, width: size.width, height: size.height, data: result.data };
}

function Reticle({ scanning }: { scanning: boolean }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!scanning) { pulse.value = 0; return; }
    pulse.value = withRepeat(withTiming(1, { duration: 1600, reduceMotion: ReduceMotion.System }), -1, true);
  }, [scanning, pulse]);
  const motion = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.value * 0.45 }));
  return <Animated.View pointerEvents="none" style={[styles.reticle, motion]}>
    {([['topLeft', styles.cornerTL], ['topRight', styles.cornerTR], ['bottomLeft', styles.cornerBL], ['bottomRight', styles.cornerBR]] as const)
      .map(([key, corner]) => <View key={key} style={[styles.corner, corner]} />)}
  </Animated.View>;
}

export function CameraScanner({ mode, busy, onBarcode, onCapture, onCaptureUri, onClose, onManual, notice,
  angles = 0, maxAngles = 1, onDone, scanTimeoutMs = SCAN_TIMEOUT_MS }: {
  mode: ScannerMode; busy: boolean; notice?: string | null;
  onBarcode: (code: string) => void; onCapture: (base64: string) => void; onClose: () => void; onManual: () => void;
  /** Label reading works from a file, not base64: text recognition takes a URI. */
  onCaptureUri?: (uri: string) => void;
  /** Angles already taken of this meal, and the cap. Above one, the shutter keeps collecting. */
  angles?: number; maxAngles?: number;
  /** Finish collecting and estimate from what has been taken so far. */
  onDone?: () => void;
  /** How long a live preview may detect nothing before saying so. A prop so a test can wait
   *  a realistic moment rather than twelve real seconds. */
  scanTimeoutMs?: number;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only a real trip to the background should tear the preview down. iOS reports 'inactive'
  // while a modal presents and while the permission alert is up, and treating that as
  // backgrounded left the camera unmounted on a screen that never recovered.
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const [stalled, setStalled] = useState(false);
  /** Set once anything has been detected, which is what stops the "nothing is scanning" notice. */
  const [detected, setDetected] = useState(false);
  const [scannerDead, setScannerDead] = useState(false);
  const clearing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = useRef(false);
  /** The code seen so far and how many frames agreed on it. Reset whenever a different one lands. */
  const agreeing = useRef<{ code: string; count: number }>({ code: '', count: 0 });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state !== 'background'));
    return () => { subscription.remove(); if (clearing.current) clearTimeout(clearing.current); };
  }, []);
  useEffect(() => {
    if (!permission?.granted || ready) return;
    const timer = setTimeout(() => setStalled(true), READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [permission?.granted, ready]);
  // A preview that runs while nothing is ever detected is the shape of barcode scanning being
  // unavailable in this build. It used to look identical to "keep holding it steadier".
  useEffect(() => {
    if (mode !== 'barcode' || !ready || detected) return;
    const timer = setTimeout(() => {
      setScannerDead(true);
      breadcrumb('barcode.scanner', { outcome: 'unavailable', source: 'camera' });
    }, scanTimeoutMs);
    return () => clearTimeout(timer);
  }, [mode, ready, detected, scanTimeoutMs]);

  const scanned = (result: BarcodeScanningResult) => {
    if (!detected) { setDetected(true); breadcrumb('barcode.scanner', { outcome: 'ok', source: 'camera' }); }
    setScannerDead(false);
    if (busy || locked.current) return;

    // A misread nearly always fails the code's own check digit — that is what the digit is for.
    // Checking it here, rather than later in the lookup, means a bad frame is simply ignored and
    // scanning continues, instead of being accepted with a success haptic and looked up.
    const code = result.data?.trim() ?? '';
    if (!normalizeBarcode(code)) { breadcrumb('barcode.scanner', { outcome: 'stale', source: 'camera' }); return; }

    // Highlight as soon as a plausible code is seen, so it is clear the frame is being read.
    setHighlight(toHighlight(result));
    if (clearing.current) clearTimeout(clearing.current);
    // A barcode that leaves the frame should stop being highlighted.
    clearing.current = setTimeout(() => setHighlight(null), 700);

    agreeing.current = agreeing.current.code === code
      ? { code, count: agreeing.current.count + 1 }
      : { code, count: 1 };
    if (agreeing.current.count < AGREEING_READS) return;

    agreeing.current = { code: '', count: 0 };
    locked.current = true;
    haptic('success');
    onBarcode(code);
    setTimeout(() => { locked.current = false; }, 1200);
  };
  const capture = async () => {
    if (busy || !ready || locked.current) return;
    locked.current = true;
    try {
      const wantsUri = mode === 'label';
      const photo = await camera.current?.takePictureAsync({ base64: !wantsUri, quality: wantsUri ? 1 : .6 });
      if (!photo?.uri || (!wantsUri && !photo.base64)) throw new Error();
      haptic('medium');
      if (wantsUri) onCaptureUri?.(photo.uri); else onCapture(photo.base64!);
    } catch { setError('The camera could not take a photo. Try again, or enter this meal by hand.'); }
    finally { locked.current = false; }
  };

  // Extra angles mostly help portion size: a side view shows depth a top-down shot cannot.
  const collecting = mode === 'photo' && maxAngles > 1;
  const full = collecting && angles >= maxAngles;
  const stalledMessage = webCameraProblem()
    ?? 'The preview has not started. Close and reopen the scanner, or enter this item by hand.';
  const deadMessage = 'Nothing is scanning. Hold the barcode flat and fill the frame — or tap below to type the number printed under it.';

  if (!permission?.granted) {
    return <SafeAreaView className="flex-1 justify-center bg-background p-6">
      <Text className="mb-3 text-3xl font-bold">{translate('camera.access')}</Text>
      <Text className="mb-6">{mode === 'barcode' ? 'Scanning a package barcode needs the camera.' : 'Estimating a meal from a photo needs the camera.'} Nothing is stored until you confirm the entry.</Text>
      {!!webCameraProblem() && <Text accessibilityRole="alert" className="mb-4">{webCameraProblem()}</Text>}
      <Action label="Allow camera access" onPress={() => { void requestPermission().catch(() => setError('Camera access is unavailable on this device.')); }} />
      {permission?.canAskAgain === false && <Action secondary label="Open Settings" onPress={() => { void Linking.openSettings().catch(() => setError('Open device Settings to enable the camera.')); }} />}
      <Action secondary label="Enter food manually" onPress={onManual} />
      <Action secondary label="Close" onPress={onClose} />
      {error && <Text accessibilityRole="alert" className="mt-4">{error}</Text>}
    </SafeAreaView>;
  }

  return <View style={styles.root}>
    {foreground && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch}
      onCameraReady={() => setReady(true)} onMountError={() => setError('The camera could not start. Enter this item by hand.')}
      barcodeScannerSettings={ready ? READY_SCAN_SETTINGS : INITIAL_SCAN_SETTINGS}
      onBarcodeScanned={mode === 'barcode' ? scanned : undefined} />}

    {mode === 'barcode' && !highlight && <Reticle scanning={!busy} />}
    {highlight && <Animated.View pointerEvents="none"
      entering={FadeIn.duration(TIMING.fast).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(TIMING.fast).reduceMotion(ReduceMotion.System)}
      style={[styles.highlight, { left: highlight.x, top: highlight.y, width: highlight.width, height: highlight.height }]}>
      <View style={styles.highlightLabel}><Text style={styles.highlightText}>{highlight.data}</Text></View>
    </Animated.View>}

    <View pointerEvents="box-none" style={[styles.chrome, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel={translate('camera.closeCamera')} onPress={onClose} style={styles.roundButton} weight="firm">
          <Text style={styles.chromeText}>✕</Text>
        </Pressable>
        <View style={styles.titlePill}>
          <Text style={styles.chromeText}>{mode === 'barcode' ? (busy ? translate('camera.lookingUp') : translate('camera.pointAtBarcode'))
            : mode === 'label' ? (busy ? translate('camera.readingLabel') : translate('camera.fillFrameLabel'))
            : collecting ? (angles === 0 ? translate('camera.fillFramePlate') : full ? `${angles} angles — that is plenty` : `${angles} taken · add a side angle, or use these`)
            : translate('camera.fillFramePlate')}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={torch ? 'Turn off torch' : 'Turn on torch'}
          accessibilityState={{ selected: torch }} onPress={() => { setTorch(value => !value); haptic('selection'); }} style={styles.roundButton} weight="firm">
          <Text style={styles.chromeText}>{torch ? '☀' : '☾'}</Text>
        </Pressable>
      </View>

      <View style={styles.bottomBar}>
        {(notice || error || stalled || scannerDead) && <View style={styles.noticePill}>
          <Text style={styles.chromeText}>{error ?? notice ?? (stalled ? stalledMessage : deadMessage)}</Text></View>}
        {collecting && angles > 0 && <View style={styles.angleRow}>
          {Array.from({ length: maxAngles }, (_, index) => <View key={index} style={[styles.angleDot, index < angles && styles.angleDotFilled]} />)}
        </View>}
        {mode !== 'barcode' && <Pressable accessibilityRole="button"
          accessibilityLabel={mode === 'label' ? translate('camera.photographLabel') : angles > 0 ? 'Take another angle' : translate('camera.takePhoto')}
          disabled={!ready || busy || full}
          onPress={() => { void capture(); }} style={[styles.shutter, (!ready || busy || full) && { opacity: .5 }]} weight="firm">
          <View style={styles.shutterInner} />
        </Pressable>}
        {collecting && angles > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`Estimate from ${angles} ${angles === 1 ? 'photo' : 'photos'}`}
          disabled={busy} onPress={onDone} style={[styles.donePill, busy && { opacity: .5 }]} weight="firm">
          <Text style={styles.doneText}>{busy ? 'Estimating…' : `Use ${angles} ${angles === 1 ? 'photo' : 'photos'}`}</Text>
        </Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={mode === 'barcode' ? translate('camera.typeBarcode') : translate('camera.enterManually')}
          onPress={onManual} style={styles.manualPill} weight="firm">
          <Text style={styles.chromeText}>{mode === 'barcode' ? translate('camera.typeBarcode') : translate('camera.enterManually')}</Text>
        </Pressable>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  // Must stay transparent: this sits directly over the live preview.
  chrome: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  bottomBar: { alignItems: 'center', gap: 14, paddingBottom: 24, paddingHorizontal: 16 },
  roundButton: { height: 48, width: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.55)' },
  titlePill: { flex: 1, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(0,0,0,.55)' },
  noticePill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(0,0,0,.65)' },
  manualPill: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.16)' },
  angleRow: { flexDirection: 'row', gap: 8 },
  angleDot: { height: 9, width: 9, borderRadius: 5, backgroundColor: 'rgba(255,255,255,.3)' },
  angleDotFilled: { backgroundColor: '#fff' },
  donePill: { paddingHorizontal: 24, paddingVertical: 13, borderRadius: 999, backgroundColor: '#fff' },
  doneText: { color: '#000', fontFamily: 'GoogleSansBold', fontSize: 15, textAlign: 'center' },
  chromeText: { color: '#fff', fontFamily: 'GoogleSansMedium', fontSize: 15, textAlign: 'center' },
  shutter: { height: 78, width: 78, borderRadius: 39, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { height: 58, width: 58, borderRadius: 29, backgroundColor: '#fff' },
  reticle: { position: 'absolute', left: '12%', right: '12%', top: '32%', height: 190 },
  corner: { position: 'absolute', height: 34, width: 34, borderColor: '#fff' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  highlight: { position: 'absolute', borderWidth: 3, borderColor: '#4ADE80', borderRadius: 12, backgroundColor: 'rgba(74,222,128,.18)', alignItems: 'center', justifyContent: 'flex-end' },
  highlightLabel: { position: 'absolute', bottom: -34, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#4ADE80' },
  highlightText: { color: '#05210F', fontFamily: 'GoogleSansBold', fontSize: 13 },
});
