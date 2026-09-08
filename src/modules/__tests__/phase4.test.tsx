import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '../../types/profile';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: true });
mock.module('react-native', { namedExports: {
  View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', ScrollView: 'ScrollView', Switch: 'Switch', KeyboardAvoidingView: 'KeyboardAvoidingView',
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
let voteInput: unknown; let rescueInput: unknown;
mock.module('../../api/campus.ts', { namedExports: {
  fetchGymBaselines: async () => [{ slug: 'werblin', baseline: 80 }],
  fetchGymSummary: async () => [{ location_slug: 'werblin', vote_count: 2, crowd_score: 25, latest_vote_at: new Date().toISOString() }],
  submitGymVote: async (slug: string, status: string) => { voteInput = { slug, status }; },
  fetchMacroRescue: async (location: unknown, remaining: unknown, preference: unknown) => { rescueInput = { location, remaining, preference }; return { matches: [], eligibleRestaurants: 0, uncoveredRestaurants: 0 }; },
} });
const { default: AuthScreen } = require('../auth/AuthScreen') as typeof import('../auth/AuthScreen');
const { default: OnboardingFlow } = require('../onboarding/OnboardingFlow') as typeof import('../onboarding/OnboardingFlow');
const { default: GymStatus } = require('../busyness/GymStatus') as typeof import('../busyness/GymStatus');
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
  await press('Sign in'); assert.deepEqual(signInInput, { email: 'student@example.com', password: 'long-password' }); assert.ok(text().includes('Invalid credentials'));
  await press('New here? Create an account'); await press('Create account');
  assert.ok(signupInput); assert.equal(navigated.at(-1), '/onboarding'); assert.equal(authStore.getState().session, null);
});
test('onboarding branches to advanced and preserves decimal weight input', async () => {
  await render(<OnboardingFlow />); await press('Advanced · training days and nutrient timing'); await press('Continue');
  assert.equal(navigated.at(-1), '/onboarding/basics');
  await act(async () => root!.update(<QueryClientProvider client={cache!}><OnboardingFlow step="basics" /></QueryClientProvider>));
  await type('Height (cm)', '180'); await type('Weight (kg)', '80.'); await type('Weight (kg)', '80.5'); await press('Continue');
  assert.equal(useOnboardingStore.getState().draft.weight_kg, 80.5); assert.equal(navigated.at(-1), '/onboarding/advanced');
});
test('advanced onboarding persists targets and timing within the daily budget', async () => {
  login(); useOnboardingStore.getState().patch({ height_cm: 180, weight_kg: 80, is_advanced_track: true,
    training_targets: { caloriesKcal: 2400, proteinG: 160, carbsG: 300, fatG: 60 }, preworkout_fast_carbs: true, preworkout_carbs_g: 30 });
  await render(<OnboardingFlow step="review" />); await press('Save profile & enter RULocked');
  assert.equal((savedProfile as UserProfile).is_advanced_track, true); assert.equal((savedProfile as UserProfile).preworkout_carbs_g, 30);
  assert.equal(authStore.getState().profile?.onboarding_completed_at, 'now');
});
test('gym UI prioritizes recent crowd data and submits interactive votes', async () => {
  login(); await render(<GymStatus />); await settle(); assert.ok(text().includes('25 / 100'));
  await press('Packed'); await settle(); assert.deepEqual(voteInput, { slug: 'werblin', status: 'Packed' });
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
