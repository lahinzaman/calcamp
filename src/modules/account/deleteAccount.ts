import { getSupabase } from '../../api/supabase';
import { removeLocalAccountData } from './localData';
import { clearNotifications } from '../notifications/service';
import { stopGeofencing } from '../background/geofencing';
import { unregisterBackgroundSync } from '../sync/background';

export interface DeletionOutcome {
  /** False when the database could erase the account's data but not the sign-in itself. */
  identityRemoved: boolean;
  /** True when provider-held recognition history could not be confirmed as purged. */
  providerHistoryPending: boolean;
}

/**
 * Best effort only. Recognition history is held by the vision provider, not Supabase, so
 * it is purged through the backend when one is configured — but a backend that is down
 * must never be the reason someone cannot delete their account.
 */
async function purgeProviderHistory(token: string): Promise<boolean> {
  const origin = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!origin || !origin.startsWith('https://')) return true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(new URL('/api/account', origin), { method: 'DELETE', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE' }) });
    return response.ok;
  } catch { return false; } finally { clearTimeout(timeout); }
}

export async function deleteAccount(owner: string): Promise<DeletionOutcome> {
  const client = getSupabase();
  const { data } = await client.auth.getSession();
  if (data.session?.user.id !== owner) throw new Error('Sign in again before deleting your account.');
  const purged = await purgeProviderHistory(data.session.access_token);
  // The backend may already have deleted the identity; a missing session is then a success.
  const stillSignedIn = (await client.auth.getSession()).data.session?.user.id === owner;
  let identityRemoved = !stillSignedIn;
  if (stillSignedIn) {
    const { data: removed, error } = await client.rpc('delete_own_account');
    if (error) throw new Error('Deletion did not go through. Check your connection and try again — nothing was removed.');
    identityRemoved = removed === true;
  }
  // Stop in-flight reconciliation before removing the owner's durable rows.
  const runtime = await import('../sync/runtime');
  if (runtime.syncEngine.owner === owner) runtime.activateSync(null);
  await Promise.allSettled([clearNotifications(), stopGeofencing(), unregisterBackgroundSync()]);
  removeLocalAccountData(owner);
  if ((await client.auth.getSession()).data.session) await client.auth.signOut({ scope: 'local' });
  return { identityRemoved, providerHistoryPending: !purged };
}
