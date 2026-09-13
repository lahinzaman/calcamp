import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '../../types/profile';
import { reanimatedMock } from './support/reanimated';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: true });
mock.module('nativewind', { namedExports: { cssInterop: () => {}, vars: (value: unknown) => value } });
mock.module('react-native-reanimated', reanimatedMock);
mock.module('react-native', { namedExports: {
  Modal: 'Modal', useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, scale: 3 }), View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', ScrollView: 'ScrollView', Switch: 'Switch', KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'web' }, AppState: { addEventListener: () => ({ remove() {} }) }, Linking: { openURL: async () => {} },
} });
mock.module('react-native-safe-area-context', { namedExports: { SafeAreaView: 'SafeAreaView' } });
let gpsCalls = 0;
mock.module('expo-location', { namedExports: { requestForegroundPermissionsAsync: async () => ({ granted: true }),
  getCurrentPositionAsync: async () => { gpsCalls++; return { coords: { latitude: 40.724, longitude: -74.304 } }; }, Accuracy: { Balanced: 3 } } });
const navigated: string[] = [];
mock.module('expo-router', { namedExports: { router: { push: (path: string) => navigated.push(path), replace: (path: string) => navigated.push(path) } } });
let signInInput: unknown; let signupInput: unknown; let savedProfile: unknown;
mock.module('../../api/supabase.ts', { namedExports: { getSupabase: () => ({ auth: {
  signInWithPassword: async (input: unknown) => { signInInput = input; return { data: { session: null }, error: new Error('Invalid credentials') }; },
  signUp: async (input: unknown) => { signupInput = input; return { data: { session: null }, error: null }; },
  signOut: async () => ({ error: null }),
} }) } });
mock.module('../../api/profile.ts', { namedExports: { completeOnboarding: async (profile: unknown) => { savedProfile = profile; return { ...(profile as object), id: 'alice', onboarding_completed_at: 'now' }; }, loadProfile: async () => null } });
let rescueInput: unknown;
mock.module('../../api/campus.ts', { namedExports: {
  fetchMacroRescue: async (location: unknown, remaining: unknown, preference: unknown) => { rescueInput = { location, remaining, preference }; return { matches: [], eligibleRestaurants: 0, uncoveredRestaurants: 0, checkedAt: new Date().toISOString() }; },
} });
mock.module('../auth/social', { namedExports: { authRedirect: () => 'calcamp://auth-callback', signInSocial: async () => {} } });
// Permission priming owns the camera and notification adapters; review only renders it.
mock.module('../onboarding/PermissionsCard', { namedExports: { PermissionsCard: () => null } });
const { default: AuthScreen } = require('../auth/AuthScreen') as typeof import('../auth/AuthScreen');
const { default: QuizScreen } = require('../onboarding/QuizScreen') as typeof import('../onboarding/QuizScreen');
const { default: ReviewScreen } = require('../onboarding/ReviewScreen') as typeof import('../onboarding/ReviewScreen');
const { NotificationSettings } = require('../notifications/NotificationSettings') as typeof import('../notifications/NotificationSettings');
const { default: MacroRescue } = require('../dining/MacroRescue') as typeof import('../dining/MacroRescue');
const { authStore } = require('../../store/authStore') as typeof import('../../store/authStore');
const { nutritionStore } = require('../../store/nutritionStore') as typeof import('../../store/nutritionStore');
const { useOnboardingStore } = require('../../store/onboardingStore') as typeof import('../../store/onboardingStore');
let root: ReactTestRenderer | undefined; let cache: QueryClient | undefined;
async function render(element: React.ReactElement) {
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { root = create(<QueryClientProvider client={cache!}>{element}</QueryClientProvider>); });
}
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
function text() { return JSON.stringify(root!.toJSON()); }
async function press(label: string) {
  const button = root!.root.findAllByType('Pressable' as React.ElementType).find(n => n.findAllByType('Text' as React.ElementType).some(t => t.props.children === label));
  assert.ok(button, `button ${label} is mounted`); await act(async () => button.props.onPress());
}
async function type(label: string, value: string) { await act(async () => root!.root.findByProps({ accessibilityLabel: label }).props.onChangeText(value)); }
const login = () => authStore.setState({ initialized: true, session: { user: { id: 'alice' } } as Session, profileStatus: 'ready', profile: null });
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined; cache?.clear(); cache = undefined;
  authStore.getState().acceptSession(null); authStore.getState().setPendingSignup(null); useOnboardingStore.getState().reset(); nutritionStore.getState().reset();
  mock.timers.reset(); navigated.length = 0; gpsCalls = 0; rescueInput = undefined;
});
test('auth screen submits credentials and signup opens onboarding without manufacturing a session', async () => {
  await render(<AuthScreen />);
  await type('Email', 'student@example.com'); await type('Password', 'long-password');
  await press('Sign in'); assert.deepEqual(signInInput, { email: 'student@example.com', password: 'long-password' }); assert.ok(text().includes('Sign-in could not finish'));
  await press('New here? Create an account'); await press('Create account');
  assert.ok(signupInput); assert.equal(navigated.at(-1), '/onboarding'); assert.equal(authStore.getState().session, null);
});
test('the quiz asks one question at a time and blocks advancing past an invalid answer', async () => {
  await render(<QuizScreen />);
  // Question 1 of N: only the track question is on screen.
  assert.ok(text().includes('How closely do you want to track?'));
  assert.ok(!text().includes('What do you want your weight to do?'));
  await press('Train seriously'); await press('Continue');
  assert.equal(useOnboardingStore.getState().draft.is_advanced_track, true);
  assert.ok(text().includes('What do you want your weight to do?'));

  // Choosing a rate-bearing goal reveals questions that a maintainer never sees.
  await press('Lose fat'); await press('Continue');
  assert.ok(text().includes('How quickly?'));
  await press('Steady · 1 lb a week'); await press('Continue');
  assert.ok(text().includes('goal weight'));
  // The goal weight question is optional, so Continue passes without an answer.
  await press('Continue');
  assert.ok(text().includes('metabolic reference'));
  await press('Male reference'); await press('Continue');

  // A date of birth under 18 is rejected in place rather than carried forward.
  await type('When were you born?', '2015-01-01'); await press('Continue');
  assert.ok(text().includes('adults 18–100'));
  assert.ok(text().includes('When were you born?'), 'must stay on the same question');
  await type('When were you born?', 'yesterday'); await press('Continue');
  assert.ok(text().includes('YYYY-MM-DD'), 'an unparseable date is refused too');
  await type('When were you born?', '2004-06-15'); await press('Continue');
  assert.ok(text().includes('How tall are you?'));
  await type('Feet', '5'); await type('Inches', '11'); await press('Continue');
  await type('Amount · lbs', '180.'); await type('Amount · lbs', '180.5'); await press('Continue');
  assert.equal(useOnboardingStore.getState().draft.weight_lbs, 180.5);
  assert.equal(useOnboardingStore.getState().draft.height_inches, 71);
});

test('a maintainer is never asked about rate or goal weight', async () => {
  await render(<QuizScreen />);
  await press('Keep it simple'); await press('Continue');
  await press('Stay where I am'); await press('Continue');
  // Straight past rate and goal weight to the metabolic reference.
  assert.ok(text().includes('metabolic reference'));
  assert.ok(!text().includes('How quickly?'));
});
test('the review screen saves the computed plan, not the draft targets', async () => {
  login(); useOnboardingStore.getState().patch({ height_inches: 71, weight_lbs: 180, lifestyle_survey: {age:21,metabolicSex:"male",composition:"balanced",priority:"energy",recovery:"steady",specializedNutrition:false,goalDirection:"lose",rateLbsPerWeek:1,dietStyle:"balanced"}, is_advanced_track: true,
    training_targets: { caloriesKcal: 2400, proteinG: 160, carbsG: 300, fatG: 60 }, preworkout_fast_carbs: true, preworkout_carbs_g: 30 });
  await render(<ReviewScreen />); await press('Start using CalCamp');
  assert.equal((savedProfile as UserProfile).is_advanced_track, true); assert.equal((savedProfile as UserProfile).preworkout_carbs_g, 30);
  assert.equal(authStore.getState().profile?.onboarding_completed_at, 'now');
});
test('macro rescue makes no location or provider call before 10 PM', async () => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-08T01:59:00Z') }); login();
  nutritionStore.getState().setDailyTargets({ macros: { caloriesKcal: 500, proteinG: 50, carbsG: 80, fatG: 20 }, micronutrients: {} });
  await render(<MacroRescue />); assert.ok(text().includes('Available 10 PM')); assert.equal(gpsCalls, 0); assert.equal(rescueInput, undefined);
});
test('macro rescue switches between Easton preset and live Millburn GPS after 10 PM', async () => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-08T02:00:00Z') }); login();
  nutritionStore.getState().setDailyTargets({ macros: { caloriesKcal: 500, proteinG: 50, carbsG: 80, fatG: 20 }, micronutrients: {} });
  await render(<MacroRescue />); await press('Easton Ave, New Brunswick'); await press('Find meals that fit'); await settle();
  assert.deepEqual((rescueInput as { location: unknown }).location, { latitude: 40.4989, longitude: -74.4477 }); assert.equal(gpsCalls, 0);
  await press('Live GPS (including Millburn)'); await press('Find meals that fit'); await settle();
  assert.deepEqual((rescueInput as { location: unknown }).location, { latitude: 40.724, longitude: -74.304 }); assert.equal(gpsCalls, 1);
});

test('notification settings mount and report invalid input without permission requests', async () => {
  login(); await render(<NotificationSettings />); await settle();
  await press('Reminders & background activity');
  assert.equal(root!.root.findByType('Modal' as React.ElementType).props.visible, true);
  assert.equal(root!.root.findByProps({ accessibilityLabel: 'Allow notifications' }).props.value, false);
  await type('Workout time (24-hour HH:MM)', '25:00'); await press('Save settings');
  assert.ok(text().includes('Use a time such as 17:00.'));
});
