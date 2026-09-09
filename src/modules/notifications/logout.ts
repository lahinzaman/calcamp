import { getSupabase } from '../../api/supabase';
import { removePushRegistration, clearNotifications } from './service';
import { stopGeofencing } from '../background/geofencing';
export async function signOutWithDeviceCleanup() {
  const client = getSupabase(); const { data } = await client.auth.getSession();
  if (data.session) {
    // Best effort when offline; generic remote gym alerts expire with the registration lease.
    try { await removePushRegistration(data.session.user.id); } catch { /* Local cleanup still runs. */ }
  }
  await clearNotifications().catch(() => {}); await stopGeofencing().catch(() => {});
  return client.auth.signOut();
}
