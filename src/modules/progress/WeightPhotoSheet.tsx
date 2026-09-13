import { useRef, useState } from 'react';
import { Image, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { Action } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { webCameraProblem } from '../quickActions/CameraScanner';
import { useT } from '../../i18n';
import { MAX_PHOTOS_PER_DAY, persistCapture, type ProgressPhoto } from './photos';

const newId = () => globalThis.crypto?.randomUUID?.() ?? `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * A weigh-in with a photo shows what the number cannot: the scale moves for water and food,
 * and a month of photos does not. Several can be taken in one sitting — front, side, back.
 * Photos stay on the device; only the weight itself is ever synced.
 */
export function WeightPhotoSheet({ weightLbs, onClose, onDone }: {
  weightLbs: number | null; onClose: () => void; onDone: (photos: ProgressPhoto[]) => void;
}) {
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState<ProgressPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const problem = webCameraProblem();

  const capture = async () => {
    if (busy || !ready || taken.length >= MAX_PHOTOS_PER_DAY) return;
    setBusy(true); setError(null);
    try {
      const shot = await camera.current?.takePictureAsync({ quality: .7 });
      if (!shot?.uri) throw new Error();
      const id = newId();
      const uri = Platform.OS === 'web' ? shot.uri : await persistCapture(shot.uri, id);
      setTaken(current => [...current, { id, uri, takenAtMs: Date.now(), weightLbs }]);
      haptic('success');
    } catch { setError('That photo could not be saved. Try again, or skip the photo for today.'); }
    finally { setBusy(false); }
  };

  if (!permission?.granted) {
    return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-background"><ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text className="mb-3 text-3xl font-bold">{t('weight.progressPhoto')}</Text>
        <Text className="mb-5 leading-6">{t('weight.photoIntro')}</Text>
        {!!problem && <Text accessibilityRole="alert" className="mb-4">{problem}</Text>}
        <Action label="Allow camera access" onPress={() => { void requestPermission().catch(() => setError('Camera access is unavailable on this device.')); }} />
        <Action secondary label={t('weight.saveWithout')} onPress={() => onDone([])} />
        <Action secondary label={t('common.cancel')} onPress={onClose} />
        {error && <Text accessibilityRole="alert" className="mt-4">{error}</Text>}
      </ScrollView></SafeAreaView>
    </Modal>;
  }

  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.root}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)}
        onMountError={() => setError('The camera could not start.')} />
      <View pointerEvents="box-none" style={[styles.chrome, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.roundButton} weight="firm">
            <Text style={styles.chromeText}>✕</Text></Pressable>
          <View style={styles.pill}><Text style={styles.chromeText}>
            {taken.length ? `${taken.length} of ${MAX_PHOTOS_PER_DAY} taken` : 'Front, side, back — your choice'}</Text></View>
        </View>

        <View style={styles.bottomBar}>
          {!!(error) && <View style={styles.pill}><Text style={styles.chromeText}>{error}</Text></View>}
          {!!taken.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 8 }}>
            {taken.map(photo => <Image key={photo.id} source={{ uri: photo.uri }} style={styles.thumb} accessibilityIgnoresInvertColors />)}
          </ScrollView>}
          <Pressable accessibilityRole="button" accessibilityLabel={t('weight.takePhoto')} disabled={!ready || busy || taken.length >= MAX_PHOTOS_PER_DAY}
            onPress={() => { void capture(); }} style={[styles.shutter, (!ready || busy || taken.length >= MAX_PHOTOS_PER_DAY) && { opacity: .5 }]} weight="firm">
            <View style={styles.shutterInner} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={taken.length ? t('common.save') : t('weight.saveWithout')}
            onPress={() => onDone(taken)} style={styles.donePill} weight="firm">
            <Text style={styles.chromeText}>{taken.length ? `${t('common.save')} · ${taken.length}` : t('weight.saveWithout')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  chrome: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  bottomBar: { alignItems: 'center', gap: 14, paddingHorizontal: 16 },
  roundButton: { height: 48, width: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.55)' },
  pill: { flex: 1, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(0,0,0,.55)' },
  donePill: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.18)' },
  chromeText: { color: '#fff', fontFamily: 'GoogleSansMedium', fontSize: 15, textAlign: 'center' },
  shutter: { height: 78, width: 78, borderRadius: 39, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { height: 58, width: 58, borderRadius: 29, backgroundColor: '#fff' },
  thumb: { height: 64, width: 48, borderRadius: 8, backgroundColor: '#222' },
});
