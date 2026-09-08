import '@/global.css';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, Text, View, useColorScheme } from 'react-native';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { TrackingProvider } from '@/components/providers/TrackingProvider';
import { Action } from '@/components/FormControls';
import { authStore, useAuthStore } from '@/store/authStore';
import { getSupabase } from '@/api/supabase';
SplashScreen.preventAutoHideAsync();
function AuthenticatedRoutes() {
  const auth = useAuthStore(s => s);
  if (!auth.initialized || (auth.session && auth.profileStatus === 'loading')) return <View className="flex-1 items-center justify-center bg-zinc-50"><ActivityIndicator /><Text className="mt-3 text-zinc-700">Loading your account…</Text></View>;
  if (auth.profileStatus === 'error' && !auth.session) return <View className="flex-1 justify-center gap-4 bg-zinc-50 p-6"><Text className="text-lg text-red-700">{auth.error}</Text><Text className="text-zinc-700">Check the public Supabase configuration and restart the app.</Text></View>;
  if (auth.profileStatus === 'error') return <View className="flex-1 justify-center gap-4 bg-zinc-50 p-6"><Text className="text-lg text-red-700">{auth.error}</Text><Action label="Retry profile" onPress={() => void authStore.getState().refreshProfile()} /><Action secondary label="Sign out" onPress={() => { void getSupabase().auth.signOut(); }} /></View>;
  const complete = !!auth.session && !!auth.profile?.onboarding_completed_at;
  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Protected guard={!auth.session}><Stack.Screen name="auth" /></Stack.Protected>
    <Stack.Protected guard={!!auth.pendingSignupEmail || (!!auth.session && !complete)}><Stack.Screen name="onboarding" /></Stack.Protected>
    <Stack.Protected guard={complete}><Stack.Screen name="(tabs)" /></Stack.Protected>
  </Stack>;
}
export default function RootLayout() {
  const scheme = useColorScheme();
  return <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}><TrackingProvider><AnimatedSplashOverlay /><AuthenticatedRoutes /></TrackingProvider></ThemeProvider>;
}
