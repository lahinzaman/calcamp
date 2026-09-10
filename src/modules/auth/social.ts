import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import Constants from 'expo-constants';
import { getSupabase } from '../../api/supabase';
import { authMessage, createCodeExchange } from './flows';
WebBrowser.maybeCompleteAuthSession();
export const authRedirect = () => {
  const configured = Constants.expoConfig?.scheme;
  const scheme = Array.isArray(configured) ? configured[0] : configured;
  return makeRedirectUri({ scheme: scheme ?? 'calcamp', path: 'auth-callback' });
};
const exchange = createCodeExchange(getSupabase);
export const completeAuthCallback = (url: string) => exchange(url, authRedirect());
let opening = false;
export async function signInSocial(provider: 'google') {
  if (opening) return; opening = true;
  try {
    const redirectTo = authRedirect();
    const { data, error } = await getSupabase().auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
    if (error || !data.url) throw new Error(authMessage(error));
    // The provider login page is trusted only when delivered by our configured Supabase project.
    const url = new URL(data.url); const project = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL!);
    if (url.origin !== project.origin || !url.pathname.startsWith('/auth/v1/authorize')) throw new Error('Sign-in provider could not be opened.');
    if (Platform.OS === 'web') { window.location.assign(data.url); return; }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === 'success') await completeAuthCallback(result.url);
  } finally { opening = false; }
}
