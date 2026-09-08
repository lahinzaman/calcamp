import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getSupabase } from '../../api/supabase';
import { authStore } from '../../store/authStore';
import { Action, Field } from '../../components/FormControls';

export default function AuthScreen() {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (busy) return;
    if (!email.trim() || password.length < (signup ? 8 : 1)) { setError(signup ? 'Enter your email and a password of at least 8 characters.' : 'Enter email and password.'); return; }
    setBusy(true); setError(null);
    try {
      const auth = getSupabase().auth;
      const { data, error: authError } = signup
        ? await auth.signUp({ email: email.trim(), password })
        : await auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      if (signup && !data.session) {
        authStore.getState().setPendingSignup(email.trim());
        router.replace('/onboarding');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  };
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView className="flex-1 bg-zinc-50" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
      <View className="mx-auto w-full max-w-md">
      <Text className="mb-2 text-sm font-bold tracking-widest text-red-700">RUTGERS • NEW BRUNSWICK</Text>
      <Text className="mb-3 text-4xl font-bold text-zinc-950">RULocked</Text>
      <Text className="mb-8 text-lg text-zinc-600">{signup ? 'Build your campus routine.' : 'Your training. Your nutrition. Your campus.'}</Text>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={signup ? 'new-password' : 'current-password'} />
      {error && <Text accessibilityRole="alert" className="mb-4 text-red-700">{error}</Text>}
      <Action label={busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'} onPress={() => void submit()} disabled={busy} />
      <Action secondary label={signup ? 'Already registered? Sign in' : 'New here? Create an account'} onPress={() => { setSignup(!signup); setError(null); }} disabled={busy} />
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
