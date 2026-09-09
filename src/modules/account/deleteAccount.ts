import { getSupabase } from '../../api/supabase';
import { removeLocalAccountData } from './localData';
import { clearNotifications } from '../notifications/service';
import { stopGeofencing } from '../background/geofencing';
import { unregisterBackgroundSync } from '../sync/background';
export async function deleteAccount(owner: string) {
  const client = getSupabase(); const { data } = await client.auth.getSession();
  if (data.session?.user.id !== owner) throw new Error('Sign in again before deleting your account.');
  const origin = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!origin || !origin.startsWith('https://')) throw new Error('Secure account deletion is not configured.');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 120000);
  let response: Response;
  try {
    response = await fetch(new URL('/api/account', origin), { method: 'DELETE', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: 'DELETE' }), signal: controller.signal });
    if (!response.ok || (await response.json()).deleted !== true) throw new Error();
  } catch { throw new Error('Deletion was not confirmed. Reconnect and retry to continue. If an earlier request completed, the account can no longer sign in.'); }
  finally { clearTimeout(timeout); }
  // Stop in-flight reconciliation before removing the owner's durable rows.
  const runtime = await import('../sync/runtime');
  if (runtime.syncEngine.owner === owner) runtime.activateSync(null);
  const current = (await client.auth.getSession()).data.session?.user.id;
  if (current === owner) await Promise.allSettled([clearNotifications(), stopGeofencing(), unregisterBackgroundSync()]);
  removeLocalAccountData(owner);
  if ((await client.auth.getSession()).data.session?.user.id === owner) await client.auth.signOut({ scope: 'local' });
}
