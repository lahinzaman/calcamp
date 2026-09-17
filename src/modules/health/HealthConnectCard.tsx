import { useState } from 'react';
import { Modal, Platform, ScrollView, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { Text } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';
import { useHealthSync } from './useHealthSync';

type Phase = 'idle' | 'checking' | 'requesting' | 'already-answered';

/**
 * The only place to connect Apple Health or Health Connect. It used to live on the walking
 * screen, which is the wrong home for it — steps and active energy feed Trends, not a walk.
 */
export function HealthConnectCard() {
  const health = useHealthSync();
  const [prompt, setPrompt] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');

  /**
   * The Apple Health sheet is requested while this prompt stays open, and the prompt closes only
   * once the request settles. Closing the prompt first raced it: iOS will not present a sheet
   * while another is still animating away, so the Health sheet was silently dropped and the
   * request never answered. A screen that is not moving cannot lose that race.
   */
  const connect = async () => {
    setPhase('checking');
    // iOS asks only about types it has never asked about. If it already has every answer, no
    // sheet will appear — and that has to be said, or it reads as the connection failing.
    const prompted = Platform.OS === 'ios' ? await health.permissionPrompt() : 'unknown';
    setPhase(prompted === 'already-answered' ? 'already-answered' : 'requesting');
    await health.initialize();
    if (prompted === 'already-answered') return; // leave the explanation on screen to be read
    setPhase('idle');
    setPrompt(false);
  };
  const close = () => { setPhase('idle'); setPrompt(false); };
  const busy = phase === 'checking' || phase === 'requesting';

  return <View>
    <View className="mb-4 flex-row flex-wrap gap-5">
      <View><Text className="text-3xl font-bold">{health.steps === null ? '—' : health.steps.toLocaleString()}</Text><Text className="text-sm">Steps today</Text></View>
      <View><Text className="text-3xl font-bold">{health.activeEnergyKcal === null ? '—' : Math.round(health.activeEnergyKcal)}</Text><Text className="text-sm">Active kcal</Text></View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Connect or refresh health" disabled={health.status === 'initializing'}
      onPress={() => { if (health.initialized) void health.refresh(); else setPrompt(true); }}
      className="mb-3 min-h-12 justify-center rounded-xl bg-raised p-4">
      <Text className="font-semibold">{health.status === 'initializing' ? 'Connecting…' : health.initialized ? 'Refresh health data' : 'Connect Apple Health or Health Connect'}</Text>
    </Pressable>
    {health.refreshedAt && <Text className="mb-2 text-xs">Last refresh {new Date(health.refreshedAt).toLocaleTimeString()} · background updates are scheduled by the device.</Text>}
    {health.error && <Text accessibilityRole="alert" className="mb-2 text-sm">{health.error}</Text>}
    <Text className="text-xs">HealthKit may return no visible data when read access is denied. Samsung Health data must be shared with Health Connect first.</Text>
    <Text className="mt-2 text-xs">Deleting a meal in CalCamp removes it from Apple Health too. On Android, remove it in Health Connect yourself — nothing is overwritten with a zero, which would skew your history.</Text>

    <Modal presentationStyle="pageSheet" animationType="slide" visible={prompt} onRequestClose={() => { if (!busy) close(); }}>
      <SafeAreaView className="flex-1 bg-background"><ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text className="text-2xl font-bold">Connect your health data</Text>

        {phase !== 'already-answered' && <>
          <Text className="mt-3 leading-6">CalCamp reads today's steps and active energy. On iOS, recent workouts appear separately from your lifting diary. Completed CalCamp workouts will be exported automatically while connected. Meals you log are shared with their energy, protein, carbohydrate and fat. Deleting a meal here removes it from Apple Health as well. You can change access in your device's Health settings.</Text>
          <Pressable accessibilityRole="button" disabled={busy} className="mt-5 min-h-12 justify-center rounded-xl bg-accent p-4"
            onPress={() => { void connect(); }}>
            <Text className="text-center font-bold">{phase === 'checking' ? 'Checking Apple Health…' : phase === 'requesting' ? 'Opening Apple Health…' : 'Continue to permissions'}</Text>
          </Pressable>
          {phase === 'requesting' && <Text className="mt-3 text-center text-sm">The Apple Health permission sheet should appear over this screen now.</Text>}
          {!busy && <Pressable accessibilityRole="button" className="mt-2 p-4" onPress={close}><Text className="text-center">Maybe later</Text></Pressable>}
        </>}

        {phase === 'already-answered' && <>
          <Text className="mt-3 leading-6">Apple Health already has your answer for CalCamp, so iOS will not show the permission sheet again — it only asks once.</Text>
          <Text className="mt-3 leading-6">To change what CalCamp can read or write, open Settings → Health → Data Access &amp; Devices → CalCamp, and turn the categories on there.</Text>
          {health.initialized && <Text className="mt-3 leading-6 font-semibold">CalCamp is connected with the access you already granted.</Text>}
          {health.error && <Text accessibilityRole="alert" className="mt-3 text-sm">{health.error}</Text>}
          <Pressable accessibilityRole="button" className="mt-5 min-h-12 justify-center rounded-xl bg-accent p-4" onPress={close}>
            <Text className="text-center font-bold">Done</Text>
          </Pressable>
        </>}
      </ScrollView></SafeAreaView>
    </Modal>
  </View>;
}
