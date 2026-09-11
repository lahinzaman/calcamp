import { SafeAreaView } from '../theme/SafeArea';
import { wrapWithTelemetry } from '../modules/telemetry/sentry';
import '../modules/background/registry';
import { NotificationLifecycle } from '../modules/notifications/Lifecycle';
import { useSyncStatus } from '@/store/syncStore';
import '../modules/sync/background';
import '@/global.css';
import { ThemeRoot, HydrateTheme } from '../theme/ThemeRoot';
import { DayRollover } from '../modules/nutrition/DayRollover';
import { useThemeStore } from '../theme/store';
import { palettes } from '../theme/palette';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { Text } from '../theme/primitives';
import { TrackingProvider } from '@/components/providers/TrackingProvider';
import { Action } from '@/components/FormControls';
import { authStore, useAuthStore } from '@/store/authStore';
import { signOutWithDeviceCleanup } from '../modules/notifications/logout';
void SplashScreen.preventAutoHideAsync().catch(() => {});
function AuthenticatedRoutes() {
  const auth = useAuthStore(s => s);
  const syncReady = useSyncStatus(s => s.ready);
  if (!auth.initialized || (auth.session && auth.profileStatus === 'loading')) return <SafeAreaView className="flex-1 items-center justify-center bg-background"><ActivityIndicator /><Text className="mt-3 text-ink">Loading your account…</Text></SafeAreaView>;
  if (auth.profileStatus === 'error' && !auth.session) return <SafeAreaView className="flex-1 justify-center gap-4 bg-background p-6"><Text className="text-lg text-ink">{auth.error}</Text><Text className="text-ink">Check your connection and available device storage, then restart the app.</Text></SafeAreaView>;
  if (auth.profileStatus === 'error') return <SafeAreaView className="flex-1 justify-center gap-4 bg-background p-6"><Text className="text-lg text-ink">{auth.error}</Text><Action label="Retry profile" onPress={() => void authStore.getState().refreshProfile()} /><Action secondary label="Sign out" onPress={() => { void signOutWithDeviceCleanup(); }} /></SafeAreaView>;
  if (auth.session && !syncReady) return <SafeAreaView className="flex-1 justify-center gap-4 bg-background p-6"><Text className="text-lg text-ink">Your device diary could not be opened. Free device space and restart the app to continue safely.</Text></SafeAreaView>;
  const complete = !!auth.session && !!auth.profile?.onboarding_completed_at;
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', animationDuration: 180 }}>
    <Stack.Protected guard={!auth.session}><Stack.Screen name="auth" /></Stack.Protected>
    <Stack.Protected guard={!!auth.pendingSignupEmail || (!!auth.session && !complete)}><Stack.Screen name="onboarding" /></Stack.Protected>
    <Stack.Protected guard={complete}><Stack.Screen name="(tabs)" /></Stack.Protected>
    <Stack.Protected guard={complete}><Stack.Screen name="walk" options={{ headerShown: true, title: 'Walk', headerBackTitle: 'Today', animation: 'slide_from_right' }} /></Stack.Protected>
    <Stack.Protected guard={complete}><Stack.Screen name="trends" options={{ headerShown: true, title: 'Trends', headerBackTitle: 'Today', animation: 'slide_from_right' }} /></Stack.Protected>
    <Stack.Protected guard={complete}><Stack.Screen name="history" options={{ headerShown: true, title: 'History', headerBackTitle: 'Today', animation: 'slide_from_right' }} /></Stack.Protected>
    <Stack.Protected guard={complete}><Stack.Screen name="calendar" options={{ headerShown: true, title: 'Calendar', headerBackTitle: 'Today', animation: 'slide_from_right' }} /></Stack.Protected>
    <Stack.Screen name="auth-callback" />
  </Stack>;
}
function RootLayout() {
  const mode = useThemeStore(s => s.mode); const palette = palettes[mode];
  const [loaded, fontError] = useFonts({ GoogleSans: require('@/assets/fonts/GoogleSans-400.ttf'), GoogleSansMedium: require('@/assets/fonts/GoogleSans-500.ttf'), GoogleSansBold: require('@/assets/fonts/GoogleSans-700.ttf') });
  useEffect(() => { if (loaded || fontError) void SplashScreen.hideAsync(); }, [loaded, fontError]);
  const base = mode === 'light' ? DefaultTheme : DarkTheme;
  const theme = { ...base, colors: { ...base.colors, background: palette.background, card: palette.surface, text: palette.ink, primary: palette.ink, border: palette.border }, fonts: Object.fromEntries(Object.entries(base.fonts).map(([key, font]) => [key, { ...font, fontFamily: key === 'regular' ? 'GoogleSans' : 'GoogleSansBold' }])) as typeof base.fonts };
  return <ThemeRoot><HydrateTheme /><StatusBar style={mode === 'light' ? 'dark' : 'light'} />{(loaded || fontError) && <ThemeProvider value={theme}><TrackingProvider><NotificationLifecycle /><DayRollover /><AuthenticatedRoutes /></TrackingProvider></ThemeProvider>}</ThemeRoot>;
}

export default wrapWithTelemetry(RootLayout);
