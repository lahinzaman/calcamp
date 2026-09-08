import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SectionListProps } from 'react-native';
import type { DailyMenuItem } from '../../types/nutrislice';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: true });
// Native host components only are mocked. Screens, hooks, stores, and Query are real.
mock.module('react-native', { namedExports: {
  View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput',
  ScrollView: 'ScrollView', Modal: 'Modal', ActivityIndicator: 'ActivityIndicator',
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
  await act(async () => findLabel('The Atrium').props.onPress());
  assert.equal(nutritionStore.getState().activeDiningHall, 'the-atrium');
  assert.ok(textContent().includes('No menu published'));
});

test('workout screen mounts an active session, estimates 1RM, and completes a set with a timer', async () => {
  const store = workoutStore.getState();
  store.startSession({ id: 'session', name: 'Upper A' });
  store.addExercise({ id: 'row', exercise: { id: 'lift', name: 'High-Pronated Grip Row' }, defaultRestSeconds: 90 });
  store.addSet({ id: 'set', sessionExerciseId: 'row' });
  await act(async () => { rendered = create(<ActiveWorkoutScreen previousSets={{ lift: [{ weightKg: 90, reps: 5 }] }} />); });
  assert.ok(textContent().includes('90 × 5'));
  await act(async () => findLabel('Weight kg set 1').props.onChangeText('100'));
  await act(async () => findLabel('Reps set 1').props.onChangeText('5'));
  await act(async () => findLabel('RPE set 1').props.onChangeText('8'));
  assert.ok(textContent().includes('112.5 kg'));
  await act(async () => findLabel('Complete set 1').props.onPress());
  assert.equal(workoutStore.getState().sets[0].estimatedOneRepMaxKg, 112.5);
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
