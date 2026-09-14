import { createClient } from '@supabase/supabase-js';

/**
 * Turns a caller's bearer token into their user id, or null. Shared so every authenticated
 * route agrees on what "signed in" means — including the deletion-pending check, which is the
 * difference between refusing work for an account on its way out and quietly doing it.
 */
export async function verifyBearer(bearer: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const timeout = (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timeout } });
  const { data, error } = await client.auth.getUser(bearer);
  if (error || !data.user) return null;
  const scoped = createClient(url, key, { auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` }, fetch: timeout } });
  const active = await scoped.rpc('account_accepts_requests');
  return !active.error && active.data === true ? data.user.id : null;
}
