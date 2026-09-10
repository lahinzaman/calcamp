import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { SafeAreaView } from '../theme/SafeArea';
import { Text } from '../theme/primitives';
import { Action } from '../components/FormControls';
import { completeAuthCallback } from '../modules/auth/social';
export default function AuthCallback() {
  const url = Linking.useLinkingURL(); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const finish = async () => {
      try {
        const incoming = url ?? await Linking.getInitialURL();
        if (!incoming) throw new Error('Start sign-in from CalCamp on this device.');
        await completeAuthCallback(incoming);
        if (active) router.replace('/');
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Sign-in could not finish.'); }
    };
    void finish(); return () => { active = false; };
  }, [url]);
  return <SafeAreaView className="flex-1 justify-center bg-background p-6">{error ? <><Text accessibilityRole="alert" className="mb-5">{error}</Text><Action label="Return to sign in" onPress={() => router.replace('/auth')} /></> : <><ActivityIndicator /><Text className="mt-4 text-center">Completing your sign-in…</Text></>}</SafeAreaView>;
}
