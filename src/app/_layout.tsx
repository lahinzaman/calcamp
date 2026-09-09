import { wrapWithTelemetry } from '../modules/telemetry/sentry';
import '../modules/background/registry';
import { NotificationLifecycle } from '../modules/notifications/Lifecycle';
import { useSyncStatus } from '@/store/syncStore';
import '../modules/sync/background';
import '@/global.css';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, Text, View, useColorScheme } from 'react-native';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { TrackingProvider } from '@/components/providers/TrackingProvider';
import { Action } from '@/components/FormControls';
import { authStore, useAuthStore } from '@/store/authStore';
import { signOutWithDeviceCleanup } from '../modules/notifications/logout';
SplashScreen.preventAutoHideAsync();
function AuthenticatedRoutes() {
  const auth = useAuthStore(s => s);
  const syncReady = useSyncStatus(s => s.ready);
  if (!auth.initialized || (auth.session && auth.profileStatus === 'loading')) return <View className="flex-1 items-center justify-center bg-zinc-50"><ActivityIndicator /><Text className="mt-3 text-zinc-700">Loading your account…</Text></View>;
  if (auth.profileStatus === 'error' && !auth.session) return <View className="flex-1 justify-center gap-4 bg-zinc-50 p-6"><Text className="text-lg text-red-700">{auth.error}</Text><Text className="text-zinc-700">Check your connection and available device storage, then restart the app.</Text></View>;
  if (auth.profileStatus === 'error') return <View className="flex-1 justify-center gap-4 bg-zinc-50 p-6"><Text className="text-lg text-red-700">{auth.error}</Text><Action label="Retry profile" onPress={() => void authStore.getState().refreshProfile()} /><Action secondary label="Sign out" onPress={() => { void signOutWithDeviceCleanup(); }} /></View>;
  if (auth.session && !syncReady) return <View className="flex-1 justify-center gap-4 bg-zinc-50 p-6"><Text className="text-lg text-zinc-900">Your device diary could not be opened. Free device space and restart the app to continue safely.</Text></View>;
  const complete = !!auth.session && !!auth.profile?.onboarding_completed_at;
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', animationDuration: 180 }}>
    <Stack.Protected guard={!auth.session}><Stack.Screen name="auth" /></Stack.Protected>
    <Stack.Protected guard={!!auth.pendingSignupEmail || (!!auth.session && !complete)}><Stack.Screen name="onboarding" /></Stack.Protected>
    <Stack.Protected guard={complete}><Stack.Screen name="(tabs)" /></Stack.Protected>
  </Stack>;
}
function RootLayout() {
  const scheme = useColorScheme();
  return <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}><TrackingProvider><NotificationLifecycle /><AnimatedSplashOverlay /><AuthenticatedRoutes /></TrackingProvider></ThemeProvider>;
}

export default wrapWithTelemetry(RootLayout);
