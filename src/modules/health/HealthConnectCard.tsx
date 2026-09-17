import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { Text } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';
import { useHealthSync } from './useHealthSync';

/**
 * The only place to connect Apple Health or Health Connect. It used to live on the walking
 * screen, which is the wrong home for it — steps and active energy feed Trends, not a walk.
 */
export function HealthConnectCard() {
  const health = useHealthSync();
  const [prompt, setPrompt] = useState(false);
  // iOS will not present the Health permission sheet while this prompt is still animating
  // closed: doing both at once silently drops the sheet, the request never resolves, and the
  // button reads "Connecting…" indefinitely. So the request waits for the prompt to finish going.
  const connectAfterDismiss = useRef(false);
  const [waitingForDismiss, setWaitingForDismiss] = useState(false);
  const connect = () => {
    if (!connectAfterDismiss.current) return;
    connectAfterDismiss.current = false;
    setWaitingForDismiss(false);
    void health.initialize();
  };
  // onDismiss is the signal; this is the net if it never arrives, as QuickActions does.
  useEffect(() => {
    if (!waitingForDismiss) return;
    const timer = setTimeout(connect, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForDismiss]);
  return <View>
    <View className="mb-4 flex-row flex-wrap gap-5">
      <View><Text className="text-3xl font-bold">{health.steps === null ? '—' : health.steps.toLocaleString()}</Text><Text className="text-sm">Steps today</Text></View>
      <View><Text className="text-3xl font-bold">{health.activeEnergyKcal === null ? '—' : Math.round(health.activeEnergyKcal)}</Text><Text className="text-sm">Active kcal</Text></View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Connect or refresh health" disabled={health.status === 'initializing' || waitingForDismiss}
      onPress={() => { if (health.initialized) void health.refresh(); else setPrompt(true); }}
      className="mb-3 min-h-12 justify-center rounded-xl bg-raised p-4">
      <Text className="font-semibold">{health.status === 'initializing' || waitingForDismiss ? 'Connecting…' : health.initialized ? 'Refresh health data' : 'Connect Apple Health or Health Connect'}</Text>
    </Pressable>
    {health.refreshedAt && <Text className="mb-2 text-xs">Last refresh {new Date(health.refreshedAt).toLocaleTimeString()} · background updates are scheduled by the device.</Text>}
    {health.error && <Text accessibilityRole="alert" className="mb-2 text-sm">{health.error}</Text>}
    <Text className="text-xs">HealthKit may return no visible data when read access is denied. Samsung Health data must be shared with Health Connect first.</Text>
    <Text className="mt-2 text-xs">Deleting a meal in CalCamp removes it from Apple Health too. On Android, remove it in Health Connect yourself — nothing is overwritten with a zero, which would skew your history.</Text>

    <Modal presentationStyle="pageSheet" animationType="slide" visible={prompt} onRequestClose={() => setPrompt(false)} onDismiss={connect}>
      <SafeAreaView className="flex-1 bg-background"><ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text className="text-2xl font-bold">Connect your health data</Text>
        <Text className="mt-3 leading-6">CalCamp reads today's steps and active energy. On iOS, recent workouts appear separately from your lifting diary. Completed CalCamp workouts will be exported automatically while connected. Meals you log are shared with their energy, protein, carbohydrate and fat. Deleting a meal here removes it from Apple Health as well. You can change access in your device's Health settings.</Text>
        <Pressable accessibilityRole="button" className="mt-5 min-h-12 justify-center rounded-xl bg-accent p-4"
          onPress={() => {
            if (Platform.OS === 'ios') { connectAfterDismiss.current = true; setWaitingForDismiss(true); setPrompt(false); }
            else { setPrompt(false); void health.initialize(); }
          }}><Text className="text-center font-bold">Continue to permissions</Text></Pressable>
        <Pressable accessibilityRole="button" className="mt-2 p-4" onPress={() => setPrompt(false)}><Text className="text-center">Maybe later</Text></Pressable>
      </ScrollView></SafeAreaView>
    </Modal>
  </View>;
}
