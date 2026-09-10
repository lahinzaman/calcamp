import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Text } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';
import { router } from 'expo-router';
import { getSupabase } from '../../api/supabase';
import { authStore } from '../../store/authStore';
import { Action, Choice, Field } from '../../components/FormControls';
import { authMessage } from './flows';
import { authRedirect, signInSocial } from './social';
import { useThemeStore } from '../../theme/store';
import { THEMES } from '../../theme/palette';
export default function AuthScreen() {
  const [signup, setSignup] = useState(false);
  const mode = useThemeStore(s => s.mode);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const working = useRef(false); const [error, setError] = useState<string | null>(null);
  const run = async (work: () => Promise<void>) => {
    if (working.current) return; working.current = true; setBusy(true); setError(null);
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-in could not finish.'); }
    finally { working.current = false; setBusy(false); }
  };
  const submit = () => run(async () => {
    if (!email.trim() || password.length < (signup ? 8 : 1)) throw new Error(signup ? 'Enter your email and a password of at least 8 characters.' : 'Enter email and password.');
    const auth = getSupabase().auth;
    const { data, error: authError } = signup ? await auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: authRedirect() } }) : await auth.signInWithPassword({ email: email.trim(), password });
    if (authError) throw new Error(authMessage(authError));
    if (signup && !data.session) { authStore.getState().setPendingSignup(email.trim()); router.replace('/onboarding'); }
  });
  return <SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <View className="mx-auto w-full max-w-md">
        <Text className="mb-3 text-sm font-bold tracking-widest">NUTRITION · TRAINING · YOU</Text>
        <Text className="mb-3 text-5xl leading-[64px] font-bold">CalCamp</Text>
        <Text className="mb-7 text-lg">A clearer picture of your everyday progress.</Text>
        <Action secondary label="Continue with Google" disabled={busy} onPress={() => void run(() => signInSocial('google'))} />
        <>
          <Field label="Email" editable={!busy} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
          <Field label="Password" editable={!busy} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={signup ? 'new-password' : 'current-password'} />
          <Action label={busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'} onPress={() => void submit()} disabled={busy} />
          <Action secondary label={signup ? 'Already registered? Sign in' : 'New here? Create an account'} onPress={() => { setSignup(!signup); setError(null); }} disabled={busy} />
        </>
        {error && <Text accessibilityRole="alert" className="my-4 rounded-xl bg-raised p-4">{error}</Text>}
        <Text className="mb-3 mt-5 text-sm">Make yourself comfortable</Text><View className="flex-row flex-wrap">{THEMES.map(theme => <Choice key={theme} label={theme[0].toUpperCase() + theme.slice(1)} selected={theme === mode} onPress={() => useThemeStore.getState().setMode(theme)} />)}</View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
