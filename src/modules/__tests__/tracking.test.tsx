import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SectionListProps } from 'react-native';
import type { DailyMenuItem } from '../../types/nutrislice';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: true });
// Native host components only are mocked. Screens, hooks, stores, and Query are real.
mock.module('nativewind', { namedExports: { cssInterop: () => {}, vars: (value: unknown) => value } });
const transition = { duration: () => ({ reduceMotion: () => undefined }) };
mock.module('react-native-reanimated', { defaultExport: { View: 'AnimatedView', createAnimatedComponent: (component: unknown) => component }, namedExports: {
  ReduceMotion: { System: 'system' }, LinearTransition: transition, FadeInDown: transition, FadeOutUp: transition, useReducedMotion: () => false,
  useSharedValue: (value: unknown) => React.useRef({ value }).current,
  useAnimatedStyle: (fn: () => unknown) => fn(), withTiming: (value: unknown) => value,
} });
mock.module('react-native', { namedExports: {
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, scale: 3 }), View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput',
  ScrollView: 'ScrollView', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator',
  AppState: { addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'web' },
  SectionList: (props: SectionListProps<DailyMenuItem, { title: string; data: DailyMenuItem[] }>) => <>
    {props.ListHeaderComponent as React.ReactNode}
    {props.sections.map((section) => <React.Fragment key={section.title}>
      {props.renderSectionHeader?.({ section })}
      {section.data.map((item, index) => <React.Fragment key={item.id}>{props.renderItem?.({ item, index, section, separators: { highlight() {}, unhighlight() {}, updateProps() {} } })}</React.Fragment>)}
      {props.renderSectionFooter?.({ section })}
    </React.Fragment>)}
  </>,
} });
mock.module('@shopify/flash-list', { namedExports: {
  FlashList: (props: { data: unknown[]; renderItem: (args: { item: unknown; index: number }) => React.ReactNode; ListHeaderComponent?: React.ReactNode; ListFooterComponent?: React.ReactNode | React.ComponentType }) => <>
    {props.ListHeaderComponent}{props.data.map((item, index) => <React.Fragment key={(item as { id: string }).id}>{props.renderItem({ item, index })}</React.Fragment>)}
    {typeof props.ListFooterComponent === 'function' ? React.createElement(props.ListFooterComponent) : props.ListFooterComponent as React.ReactNode}
  </>,
  useRecyclingState: (value: unknown) => React.useState(value),
} });
mock.module('lottie-react-native', { defaultExport: 'LottieView' });
mock.module('expo-crypto', { namedExports: { randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } });
mock.module('expo-location', { namedExports: { requestForegroundPermissionsAsync: async () => ({ granted: false }), getCurrentPositionAsync: async () => ({ coords: { latitude: 0, longitude: 0 } }), Accuracy: { Balanced: 3 } } });
mock.module('react-native-safe-area-context', { namedExports: { SafeAreaView: 'SafeAreaView' } });

const { default: DiningHallScreen } = require('../dining/DiningHallScreen') as typeof import('../dining/DiningHallScreen');
const { default: ActiveWorkoutScreen } = require('../workout/ActiveWorkoutScreen') as typeof import('../workout/ActiveWorkoutScreen');
const { useFoodVision } = require('../vision/useFoodVision') as typeof import('../vision/useFoodVision');
const { nutritionStore } = require('../../store/nutritionStore') as typeof import('../../store/nutritionStore');
const { workoutStore } = require('../../store/workoutStore') as typeof import('../../store/workoutStore');
const { normalizeMenuDate } = require('../../api/nutrislice') as typeof import('../../api/nutrislice');
let rendered: ReactTestRenderer | undefined;
let client: QueryClient | undefined;
afterEach(async () => {
  await act(async () => rendered?.unmount());
  client?.clear(); rendered = undefined; client = undefined;
  nutritionStore.getState().reset(); workoutStore.getState().reset();
});

function findLabel(label: string) { return rendered!.root.findByProps({ accessibilityLabel: label }); }
function textContent() { return JSON.stringify(rendered!.toJSON()); }

test('dining screen mounts, changes hall, and logs corrected food into the real store', async () => {
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  const date = normalizeMenuDate(new Date());
  const item: DailyMenuItem = {
    id: 'rice', diningHall: 'busch-dining-hall', date, meal: 'lunch', menuItemId: 1, foodId: 1, name: 'Rice',
    serving: { amount: 1, unit: 'cup', label: '1 cup' },
    macros: { caloriesKcal: null, proteinG: 4, carbsG: 45, fatG: 0 }, nutrients: { g_fiber: 2 },
  };
  client.setQueryData(['nutrislice', 'busch-dining-hall', date], [item]);
  client.setQueryData(['nutrislice', 'the-atrium', date], []);
  await act(async () => { rendered = create(<QueryClientProvider client={client!}><DiningHallScreen /></QueryClientProvider>); });
  assert.ok(textContent().includes('Campus dining'));
  await act(async () => findLabel('Log Rice to diary').props.onPress());
  await act(async () => rendered!.root.findAllByType('Pressable' as React.ElementType).find((node) => node.findAllByType('Text' as React.ElementType).some((text) => text.props.children === 'Confirm log'))!.props.onPress());
  assert.equal(nutritionStore.getState().consumedMacros.caloriesKcal, 0, 'unknown calories cannot be logged');
  await act(async () => findLabel('Calories · kcal').props.onChangeText('200'));
  await act(async () => findLabel('Number of servings').props.onChangeText('2'));
  await act(async () => rendered!.root.findAllByType('Pressable' as React.ElementType).find((node) => node.findAllByType('Text' as React.ElementType).some((text) => text.props.children === 'Confirm log'))!.props.onPress());
  assert.equal(nutritionStore.getState().consumedMacros.caloriesKcal, 400);
  assert.equal(nutritionStore.getState().consumedMicros.fiber_g, 4);
  await act(async () => findLabel('Dining hall: Busch Dining Hall').props.onPress());
  await act(async () => rendered!.root.findAllByType('Pressable' as React.ElementType).find(n=>n.props.accessibilityRole==='radio' && n.findAllByType('Text' as React.ElementType).some(t=>Array.isArray(t.props.children) && t.props.children.includes('The Atrium')))?.props.onPress());
  assert.equal(nutritionStore.getState().activeDiningHall, 'the-atrium');
  assert.ok(textContent().includes('No menu published'));
});

test('workout screen mounts an active session, estimates 1RM, and completes a set with a timer', async () => {
  const store = workoutStore.getState();
  store.startSession({ id: 'session', name: 'Upper A' });
  store.addExercise({ id: 'row', exercise: { id: 'lift', name: 'High-Pronated Grip Row' }, defaultRestSeconds: 90 });
  store.addSet({ id: 'set', sessionExerciseId: 'row' });
  await act(async () => { rendered = create(<ActiveWorkoutScreen previousSets={{ lift: [{ weightLbs: 90, reps: 5 }] }} />); });
  assert.ok(textContent().includes('90 × 5'));
  await act(async () => findLabel('Weight lbs set 1').props.onChangeText('100'));
  await act(async () => findLabel('Reps set 1').props.onChangeText('5'));
  await act(async () => findLabel('RPE set 1').props.onChangeText('8'));
  assert.ok(textContent().includes('112.5 lbs'));
  await act(async () => findLabel('Complete set 1').props.onPress());
  assert.equal(workoutStore.getState().sets[0].estimatedOneRepMaxLbs, 112.5);
  assert.equal(workoutStore.getState().restTimer?.durationSeconds, 90);
  assert.ok(workoutStore.getState().sets[0].completedAtMs !== null);
});

test('vision hook exposes configuration failure, validates estimates, and accepts manual correction', async () => {
  let hook!: ReturnType<typeof useFoodVision>;
  function Probe() { hook = useFoodVision(); return null; }
  await act(async () => { rendered = create(<Probe />); });
  await act(async () => { await hook.analyze('YWJj'); });
  assert.equal(hook.error?.code, 'NOT_CONFIGURED');
  assert.equal(hook.manualOverrideRequired, true);
  await act(async () => { hook.applyManualOverride({ portion_size_grams: 100, macros: { caloriesKcal: 200, proteinG: 20, carbsG: 20, fatG: 5 } }); });
  assert.equal(hook.result?.source, 'manual');
  assert.equal(hook.manualOverrideRequired, false);
});

test('vision ignores stale results after manual override and bounds stalled adapters', async () => {
  let hook!: ReturnType<typeof useFoodVision>;
  let resolve!: (value: unknown) => void;
  const analyzer = () => new Promise((done) => { resolve = done; });
  function Probe() { hook = useFoodVision({ analyzer, timeoutMs: 20 }); return null; }
  await act(async () => { rendered = create(<Probe />); });
  let pending!: Promise<unknown>;
  await act(async () => { pending = hook.analyze({ uri: 'file:///meal.jpg' }); });
  await act(async () => { hook.triggerManualOverride(); });
  await act(async () => { resolve({ portion_size_grams: 100, macros: { caloriesKcal: 200, proteinG: 20, carbsG: 20, fatG: 5 } }); await pending; });
  assert.equal(hook.result, null);
  assert.equal(hook.manualOverrideRequired, true);
  await act(async () => { await hook.analyze('YWJj'); });
  assert.equal(hook.error?.code, 'TIMEOUT');
});

test('health initialization fills memory, clears unavailable steps, and writes explicit records once', async () => {
  const { createHealthStore } = require('../health/useHealthSync') as typeof import('../health/useHealthSync');
  let available = true, workouts = 0, meals = 0, initializes = 0;
  const store = createHealthStore(async () => ({ initialize: async () => { initializes++; },
    readToday: async () => ({ date: '2026-09-07', steps: available ? 8000 : null, activeEnergyKcal: 250 }),
    writeWorkout: async () => { workouts++; }, writeDietaryEnergy: async () => { meals++; },
  }), () => new Date(2026, 8, 7, 12));
  await store.getState().initialize();
  assert.equal(initializes, 1); assert.equal(store.getState().steps, 8000);
  const workout = { id: 'workout', name: 'Upper A', start: '2026-09-07T10:00:00Z', end: '2026-09-07T11:00:00Z' };
  await store.getState().writeWorkout(workout); await store.getState().writeWorkout(workout); assert.equal(workouts, 1);
  await store.getState().writeDietaryEnergy({ id: 'meal', name: 'Lunch', date: workout.end, caloriesKcal: 400 }); assert.equal(meals, 1);
  await assert.rejects(store.getState().writeDietaryEnergy({ id: 'bad', name: 'Lunch', date: workout.end, caloriesKcal: -1 }));
  available = false; await store.getState().refresh(); assert.equal(store.getState().steps, null);
  const unavailable = createHealthStore(async () => { throw new Error('Native health unavailable'); });
  await unavailable.getState().initialize(); assert.equal(unavailable.getState().status, 'error'); assert.equal(unavailable.getState().steps, null);
});

test('vision HTTP adapter sends authenticated base64 JSON using the server contract', async () => {
  const { createVisionProxyAnalyzer } = require('../vision/useFoodVision') as typeof import('../vision/useFoodVision');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), 'https://api.example/api/vision');
      assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer user-session');
      assert.deepEqual(JSON.parse(String(options?.body)), { image: { base64: '/9j/4AECAwQ=', mimeType: 'image/jpeg' } });
      return Response.json({ portion_size_grams: 100, macros: { caloriesKcal: 100, proteinG: 5, carbsG: 10, fatG: 4 } });
    };
    const analyzer = createVisionProxyAnalyzer('https://api.example/api/vision', async () => 'user-session');
    await analyzer({ base64: '/9j/4AECAwQ=', mimeType: 'image/jpeg' }, new AbortController().signal);
    await assert.rejects(createVisionProxyAnalyzer('https://api.example/api/vision', async () => null)({ base64: '/9j/4AECAwQ=', mimeType: 'image/jpeg' }, new AbortController().signal), /Sign in/);
  } finally { globalThis.fetch = originalFetch; }
});

test('late native permission results cannot initialize a reset health session', async () => {
  const { createHealthStore } = require('../health/useHealthSync') as typeof import('../health/useHealthSync');
  let resolve!: () => void;
  const store = createHealthStore(async () => ({ initialize: () => new Promise<void>(r => { resolve = r; }),
    readToday: async () => ({ date: '2026-09-08', steps: 100, activeEnergyKcal: 10 }), writeWorkout: async () => {}, writeDietaryEnergy: async () => {},
  }));
  const request = store.getState().initialize(); await new Promise(r => setImmediate(r));
  store.getState().reset(); resolve(); await request; assert.equal(store.getState().initialized, false); assert.equal(store.getState().steps, null);
});

test('sync indicator renders queued, syncing and acknowledged states', async () => {
  const { SyncIndicator } = require('../../components/SyncIndicator') as typeof import('../../components/SyncIndicator');
  const { useSyncStatus } = require('../../store/syncStore') as typeof import('../../store/syncStore');
  useSyncStatus.setState({ ready: true, online: false, queued: 2, blocked: 0, error: null });
  await act(async () => { rendered = create(<SyncIndicator />); }); assert.ok(textContent().includes('Offline · 2 queued'));
  await act(async () => useSyncStatus.setState({ online: true, syncing: true })); assert.ok(textContent().includes('Syncing…'));
  await act(async () => useSyncStatus.setState({ syncing: false, queued: 0, lastSyncedAt: 1 })); assert.ok(textContent().includes('Synced'));
  await act(async () => useSyncStatus.setState({ ready: false, lastSyncedAt: null }));
});

test('walk screen mounts, keeps manual steps usable and explains health sharing before requesting access', async () => {
  const { default: StepRouterScreen } = require('../routing/StepRouterScreen') as typeof import('../routing/StepRouterScreen');
  await act(async () => { rendered = create(<StepRouterScreen />); });
  await act(async () => findLabel('Manual step count').props.onChangeText('10000')); assert.ok(textContent().includes('Step goal reached.'));
  await act(async () => findLabel('Connect or refresh health').props.onPress());
  assert.equal(rendered!.root.find(node => String(node.type) === 'Modal').props.visible, true); assert.ok(textContent().includes('exported automatically'));
});

test('CalCamp dashboard mounts real targets and all four training days', async () => {
  mock.module('expo-router', { namedExports: { router: { push: () => {} } } });
  const { default: DashboardScreen } = require('../dashboard/DashboardScreen') as typeof import('../dashboard/DashboardScreen');
  nutritionStore.getState().setDailyTargets({ macros: { caloriesKcal: 2400, proteinG: 150, carbsG: 270, fatG: 80 }, micronutrients: {} });
  nutritionStore.getState().setConsumed({ caloriesKcal: 900, proteinG: 60, carbsG: 110, fatG: 25 });
  await act(async () => { rendered = create(<DashboardScreen />); });
  assert.ok(textContent().includes('1500 kcal remaining'));
  for (const plan of ['Upper A','Upper B','Lower A','Lower B']) assert.ok(textContent().includes(plan));
  assert.equal(rendered!.root.findAllByProps({ accessibilityRole: 'progressbar' }).length, 4);
});

test('workout templates create actual Lower sessions and removal clears a draft row', async () => {
  await act(async () => { rendered = create(<ActiveWorkoutScreen />); });
  const press = (label: string) => rendered!.root.findAllByType('Pressable' as React.ElementType).find(node => node.findAllByType('Text' as React.ElementType).some(text => text.props.children === label))!.props.onPress();
  await act(async () => press('Lower B')); await act(async () => press('Start session'));
  assert.equal(workoutStore.getState().activeSession?.name, 'Lower B'); assert.equal(workoutStore.getState().sets.length, 9);
  assert.equal(workoutStore.getState().exerciseSequence[0].exercise.name, 'Romanian Deadlift');
  await act(async () => findLabel('Remove set 1').props.onPress()); assert.equal(workoutStore.getState().sets.length, 8);
});
