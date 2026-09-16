import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
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
    {/* Said plainly because the alternative — overwriting the sample with zero — would leave a
        0 kcal meal in the history and skew every average computed from it. */}
    <Text className="mt-2 text-xs">Deleting a meal in CalCamp does not remove it from Apple Health. Remove it there too if you need the two to match.</Text>

    <Modal presentationStyle="pageSheet" animationType="slide" visible={prompt} onRequestClose={() => setPrompt(false)}>
      <SafeAreaView className="flex-1 bg-background"><ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text className="text-2xl font-bold">Connect your health data</Text>
        <Text className="mt-3 leading-6">CalCamp reads today's steps and active energy. On iOS, recent workouts appear separately from your lifting diary. Completed CalCamp workouts will be exported automatically while connected. Meals you log are shared with their energy, protein, carbohydrate and fat. Deleting a meal here does not remove it from Apple Health — remove it there too if you need the two to match. You can change access in your device's Health settings.</Text>
        <Pressable accessibilityRole="button" className="mt-5 min-h-12 justify-center rounded-xl bg-accent p-4"
          onPress={() => { setPrompt(false); void health.initialize(); }}><Text className="text-center font-bold">Continue to permissions</Text></Pressable>
        <Pressable accessibilityRole="button" className="mt-2 p-4" onPress={() => setPrompt(false)}><Text className="text-center">Maybe later</Text></Pressable>
      </ScrollView></SafeAreaView>
    </Modal>
  </View>;
}
