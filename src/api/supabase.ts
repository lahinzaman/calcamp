import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { authStorage } from './authStorage';

let client: SupabaseClient | undefined;
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Configure the public Supabase URL and publishable key.');
  client = createClient(url, key, { auth: {
    storage: authStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
  } });
  return client;
}
