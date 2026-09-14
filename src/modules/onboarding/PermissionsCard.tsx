import { useState } from 'react';
import { View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { haptic } from '../../theme/haptics';
import { useAuthStore } from '../../store/authStore';
import { defaultPreferences } from '../notifications/policy';
import { readPreferences, savePreferences } from '../notifications/preferences';
import { configureNotifications, notificationsGranted } from '../notifications/service';
import { useT } from '../../i18n';

type State = 'idle' | 'asking' | 'granted' | 'refused';

function Row({ title, why, state, label, onPress }: {
  title: string; why: string; state: State; label: string; onPress?: () => void;
}) {
  const t = useT();
  return <View className="mb-3 rounded-2xl bg-raised p-4">
    <View className="mb-1 flex-row items-baseline justify-between gap-3">
      <Text className="flex-1 font-bold">{title}</Text>
      {state === 'granted' && <Text className="text-sm font-bold">{t('permissions.on')}</Text>}
    </View>
    <Text className="mb-3 text-sm leading-5">{why}</Text>
    {state !== 'granted' && onPress && <Pressable accessibilityRole="button" accessibilityLabel={label}
      disabled={state === 'asking'} onPress={onPress} weight="firm"
      className="min-h-12 items-center justify-center rounded-xl bg-surface px-4">
      <Text className="font-semibold">{state === 'asking' ? t('permissions.waiting') : state === 'refused' ? t('permissions.askAgain') : label}</Text>
    </Pressable>}
    {state === 'refused' && <Text className="mt-2 text-xs">{t('permissions.declined')}</Text>}
  </View>;
}

/**
 * The system dialogs only appear when the app asks, and nothing asked until you happened to
 * open the scanner or dig through Settings — so most people never saw them. This asks once,
 * up front, having first said what each permission is for.
 */
export function PermissionsCard() {
  const t = useT();
  const owner = useAuthStore(s => s.session?.user.id);
  const [camera, requestCamera] = useCameraPermissions();
  const [notifications, setNotifications] = useState<State>('idle');
  const [cameraOutcome, setCameraOutcome] = useState<State>('idle');
  const cameraState: State = camera?.granted ? 'granted'
    : cameraOutcome !== 'idle' ? cameraOutcome
    : camera && !camera.canAskAgain ? 'refused' : 'idle';

  // A request that resolves without granting is the answer; without this the button simply
  // appeared to do nothing, which reads as the app refusing rather than the system.
  const askCamera = async () => {
    setCameraOutcome('asking');
    try {
      const result = await requestCamera();
      setCameraOutcome(result?.granted ? 'granted' : 'refused');
    } catch { setCameraOutcome('refused'); }
  };

  const askNotifications = async () => {
    if (!owner) return;
    setNotifications('asking');
    try {
      const preferences = { ...defaultPreferences, ...readPreferences(owner), enabled: true };
      savePreferences(owner, preferences);
      await configureNotifications(owner, preferences, null, true);
      setNotifications('granted'); haptic('success');
    } catch {
      // Scheduling reminders succeeds long before push registration does, and registration
      // cannot finish on a simulator or an unlinked build. Neither is the person saying no,
      // so the system is asked what was actually decided.
      const allowed = await Promise.resolve().then(notificationsGranted).catch(() => false);
      setNotifications(allowed ? 'granted' : 'refused'); haptic(allowed ? 'success' : 'warning');
    }
  };

  return <View className="mb-4 rounded-3xl border border-border bg-surface p-5">
    <Text className="mb-1 text-sm font-bold tracking-widest">{t('permissions.heading')}</Text>
    <Text className="mb-4">{t('permissions.intro')}</Text>
    <Row title={t('permissions.camera')} state={cameraState} label={t('permissions.allowCamera')}
      why={t('permissions.cameraWhy')}
      onPress={() => { void askCamera(); haptic('selection'); }} />
    <Row title={t('permissions.notifications')} state={notifications} label={t('permissions.allowNotifications')}
      why={t('permissions.notificationsWhy')}
      onPress={() => { void askNotifications(); }} />
    <Text className="text-xs">{t('permissions.noMicrophone')}</Text>
  </View>;
}
