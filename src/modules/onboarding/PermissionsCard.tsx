import { useState } from 'react';
import { View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { haptic } from '../../theme/haptics';
import { useAuthStore } from '../../store/authStore';
import { defaultPreferences } from '../notifications/policy';
import { readPreferences, savePreferences } from '../notifications/preferences';
import { configureNotifications } from '../notifications/service';

type State = 'idle' | 'asking' | 'granted' | 'refused';

function Row({ title, why, state, label, onPress }: {
  title: string; why: string; state: State; label: string; onPress?: () => void;
}) {
  return <View className="mb-3 rounded-2xl bg-raised p-4">
    <View className="mb-1 flex-row items-baseline justify-between gap-3">
      <Text className="flex-1 font-bold">{title}</Text>
      {state === 'granted' && <Text className="text-sm font-bold">On</Text>}
    </View>
    <Text className="mb-3 text-sm leading-5">{why}</Text>
    {state !== 'granted' && onPress && <Pressable accessibilityRole="button" accessibilityLabel={label}
      disabled={state === 'asking'} onPress={onPress} weight="firm"
      className="min-h-12 items-center justify-center rounded-xl bg-surface px-4">
      <Text className="font-semibold">{state === 'asking' ? 'Waiting for your answer…' : state === 'refused' ? 'Ask again' : label}</Text>
    </Pressable>}
    {state === 'refused' && <Text className="mt-2 text-xs">Declined. You can turn this on later in your device Settings.</Text>}
  </View>;
}

/**
 * The system dialogs only appear when the app asks, and nothing asked until you happened to
 * open the scanner or dig through Settings — so most people never saw them. This asks once,
 * up front, having first said what each permission is for.
 */
export function PermissionsCard() {
  const owner = useAuthStore(s => s.session?.user.id);
  const [camera, requestCamera] = useCameraPermissions();
  const [notifications, setNotifications] = useState<State>('idle');
  const cameraState: State = camera?.granted ? 'granted' : camera && !camera.canAskAgain ? 'refused' : 'idle';

  const askNotifications = async () => {
    if (!owner) return;
    setNotifications('asking');
    try {
      const preferences = { ...defaultPreferences, ...readPreferences(owner), enabled: true };
      savePreferences(owner, preferences);
      await configureNotifications(owner, preferences, null, true);
      setNotifications('granted'); haptic('success');
    } catch { setNotifications('refused'); haptic('warning'); }
  };

  return <View className="mb-4 rounded-3xl border border-border bg-surface p-5">
    <Text className="mb-1 text-sm font-bold tracking-widest">PERMISSIONS</Text>
    <Text className="mb-4">Two of these make the app work better. Neither is required, and you can change both later.</Text>
    <Row title="Camera" state={cameraState} label="Allow camera"
      why="Scan a barcode, photograph a plate, and take progress photos with a weigh-in. Photos you take stay on this device."
      onPress={() => { void requestCamera().catch(() => {}); haptic('selection'); }} />
    <Row title="Notifications" state={notifications} label="Allow notifications"
      why="Meal, training and weekly weigh-in reminders, at times you choose. Nothing is sent until you turn a reminder on."
      onPress={() => { void askNotifications(); }} />
    <Text className="text-xs">CalCamp never asks for your microphone — nothing in the app records audio.</Text>
  </View>;
}
