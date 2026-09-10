import { metersToMiles, metersToFeet } from '../../lib/units';
import { SyncIndicator } from '../../components/SyncIndicator';
import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { Text, TextInput } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';
import * as Location from 'expo-location';
import { useHealthSync } from '../health/useHealthSync';
import RouteMap from './RouteMap';
import { COLLEGE_AVE, generateWalkingLoop, stepDeficit, type Coordinate, type WalkingLoop } from './walkingLoop';

async function locate(signal: AbortSignal): Promise<Location.LocationObject> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('Location cancelled.')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); reject(new Error('Location timed out.')); }, 15_000);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(resolve, reject)
      .finally(() => { clearTimeout(timer); signal.removeEventListener('abort', abort); });
  });
}

export default function StepRouterScreen() {
  const health = useHealthSync();
  const [healthPrompt, setHealthPrompt] = useState(false);
  const [manualSteps, setManualSteps] = useState('');
  const [route, setRoute] = useState<WalkingLoop | null>(null);
  const [start, setStart] = useState<Coordinate>(COLLEGE_AVE);
  const [startLabel, setStartLabel] = useState('Rutgers College Ave');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
  const steps = manualSteps !== '' ? (/^\d+$/.test(manualSteps) ? Number(manualSteps) : null) : health.steps;
  const deficit = steps !== null && Number.isSafeInteger(steps) ? stepDeficit(steps) : null;
  useEffect(() => { request.current?.abort(); setRoute(null); setBusy(false); }, [steps]);
  useEffect(() => () => request.current?.abort(), []);
  async function generate(useGps: boolean) {
    if (!deficit || deficit.distanceMeters < 100) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(null); setRoute(null);
    try {
      let origin = COLLEGE_AVE;
      let label = 'Rutgers College Ave';
      if (useGps) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.granted) {
          try {
            const location = await locate(controller.signal);
            origin = [location.coords.longitude, location.coords.latitude]; label = 'Your current location';
          } catch { label = 'Rutgers College Ave · GPS unavailable'; }
        } else label = 'Rutgers College Ave · location permission not granted';
      }
      if (controller.signal.aborted) return;
      setStart(origin); setStartLabel(label);
      const loop = await generateWalkingLoop(origin, deficit.distanceMeters, { token, signal: controller.signal });
      if (!controller.signal.aborted) setRoute(loop);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Route unavailable.'); }
    finally { if (request.current === controller) setBusy(false); }
  }
  return <SafeAreaView edges={['left', 'right', 'bottom']} className="flex-1 bg-background">
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Text className="text-sm font-black tracking-widest text-ink">CALCAMP · CAMPUS WALKS</Text>
      <Text className="mb-2 mt-5 text-4xl font-bold text-ink">Close your step gap.</Text>
      <Text className="mb-6 text-base text-ink">A walk toward your 10,000-step goal.</Text>
      <SyncIndicator />
      <View className="mb-5 rounded-3xl bg-background p-6">
        <Text className="text-sm text-ink">{health.date} · Today's steps</Text>
        <Text className="my-3 text-4xl font-bold text-ink">{steps === null ? '—' : steps.toLocaleString()}</Text>
        <Text className="text-sm text-ink">{deficit ? `${deficit.remainingSteps.toLocaleString()} steps remaining · ${metersToMiles(deficit.distanceMeters).toFixed(2)} mi target` : 'Connect health or enter a step count.'}</Text>
        <Text className="mt-3 text-xs text-ink">Active energy: {health.activeEnergyKcal === null ? 'unavailable' : `${Math.round(health.activeEnergyKcal)} kcal`}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Connect or refresh health" disabled={health.status === 'initializing'} onPress={() => { if (health.initialized) void health.refresh(); else setHealthPrompt(true); }} className="mb-3 rounded-xl bg-surface p-4"><Text className="font-semibold">{health.status === 'initializing' ? 'Connecting…' : 'Connect / refresh health'}</Text></Pressable>
      {health.refreshedAt && <Text className="mb-3 text-xs text-ink">Last health refresh: {new Date(health.refreshedAt).toLocaleTimeString()} · background updates are scheduled by the device.</Text>}
      <Modal presentationStyle="pageSheet" animationType="slide" visible={healthPrompt} onRequestClose={() => setHealthPrompt(false)}><SafeAreaView className="flex-1 bg-surface"><ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text className="text-xl font-bold">Connect your health data</Text><Text className="mt-3 leading-6 text-ink">CalCamp reads today's steps and active energy. On iOS, recent workouts appear separately from your lifting diary. Completed CalCamp workouts will be exported automatically while connected. Dietary energy is shared only when you request an export. You can change access in your device's Health settings.</Text>
        <Pressable accessibilityRole="button" className="mt-5 rounded-xl bg-accent p-4" onPress={() => { setHealthPrompt(false); void health.initialize(); }}><Text className="text-center font-bold text-ink">Continue to permissions</Text></Pressable>
        <Pressable accessibilityRole="button" className="mt-2 p-4" onPress={() => setHealthPrompt(false)}><Text className="text-center">Maybe later</Text></Pressable>
      </ScrollView></SafeAreaView></Modal>
      {health.error && <Text className="mb-3 text-sm text-ink">{health.error}</Text>}
      <Text className="mb-2 text-sm text-ink">Optional manual step count</Text>
      <TextInput accessibilityLabel="Manual step count" keyboardType="number-pad" inputMode="numeric" value={manualSteps} onChangeText={setManualSteps} placeholder="Use health steps" className="mb-4 rounded-xl border border-border bg-surface p-4" />
      <Text className="mb-4 text-xs leading-5 text-ink">Distance assumes 2.46 ft per step. HealthKit may return no visible data when read access is denied. Samsung Health data must be shared with Health Connect.</Text>
      {!token && <Text className="mb-4 text-sm text-ink">Add a public Mapbox token to enable route generation.</Text>}
      <Pressable accessibilityRole="button" disabled={busy || !token || !deficit || deficit.distanceMeters < 100} onPress={() => void generate(true)} className="mb-3 rounded-2xl bg-accent p-4 disabled:opacity-40"><Text className="text-center font-bold text-ink">{busy ? 'Finding a walk…' : 'Walk from my location'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy || !token || !deficit || deficit.distanceMeters < 100} onPress={() => void generate(false)} className="mb-5 rounded-xl bg-surface p-4"><Text className="text-center font-semibold">Start at Rutgers College Ave</Text></Pressable>
      {deficit && deficit.remainingSteps === 0 && <Text className="mb-4 font-semibold text-ink">Step goal reached.</Text>}
      {deficit && deficit.remainingSteps > 0 && deficit.distanceMeters < 100 && <Text className="mb-4 text-ink">Less than 328 ft remains. A short walk is enough; no loop is needed.</Text>}
      {error && <Text accessibilityRole="alert" className="mb-4 text-ink">{error}</Text>}
      {token && <RouteMap start={start} route={route} token={token} />}
      {route && <View className="mt-5 rounded-3xl bg-surface p-5"><Text className="text-xl font-bold">{metersToMiles(route.distanceMeters).toFixed(2)} mi · {Math.round(route.durationSeconds / 60)} min</Text><Text className="mt-2 text-ink">{startLabel}</Text><Text className="mt-3 text-ink">{route.withinTolerance ? 'Close to your target' : 'Closest loop found'} · {Math.round(metersToFeet(Math.abs(route.differenceMeters)))} ft {route.differenceMeters >= 0 ? 'longer' : 'shorter'}</Text><Text className="mt-3 text-xs leading-5 text-ink">Walking paths determine the final distance. This loop may retrace sections. Check access and crossings before heading out.</Text></View>}
    </ScrollView>
  </SafeAreaView>;
}
