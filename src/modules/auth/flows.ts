import type { SupabaseClient } from '@supabase/supabase-js';
export function authMessage(error: unknown) {
  const code = typeof error === 'object' && error ? String((error as { code?: string }).code ?? '') : '';
  if (/provider_disabled|validation_failed|unsupported_provider/.test(code)) return 'This sign-in method is not available yet. Try email or another method.';
  if (code === 'email_not_confirmed') return 'Confirm your email before signing in.';
  if (code === 'invalid_credentials') return 'Email or password did not match. Please try again.';
  return 'Sign-in could not finish. Check your connection and try again.';
}
/** Only codes returned to this app's exact callback may use the stored PKCE verifier. */
export function callbackCode(raw: string, expected: string) {
  const url = new URL(raw); const target = new URL(expected);
  if (url.protocol !== target.protocol || url.host !== target.host || url.pathname.replace(/\/$/, '') !== target.pathname.replace(/\/$/, '')) throw new Error('Unrecognized sign-in callback.');
  if (url.searchParams.has('error') || url.hash.includes('error=')) throw new Error('Sign-in was cancelled or declined. Please try again.');
  const code = url.searchParams.get('code');
  if (!code || code.length > 4096) throw new Error('This sign-in link is incomplete. Start sign-in again on this device.');
  return code;
}
export function createCodeExchange(client: () => SupabaseClient) {
  const pending = new Map<string, Promise<void>>(); const finished = new Set<string>();
  return async (raw: string, expected: string) => {
    const code = callbackCode(raw, expected);
    if (finished.has(code)) return;
    const current = pending.get(code); if (current) return current;
    const work = (async () => {
      const { data, error } = await client().auth.exchangeCodeForSession(code);
      if (error || !data.session) throw new Error('Sign-in link expired or belongs to another device. Start sign-in again.');
      finished.add(code); if (finished.size > 20) finished.delete(finished.values().next().value!);
    })();
    pending.set(code, work);
    try { await work; } finally { pending.delete(code); }
  };
}
