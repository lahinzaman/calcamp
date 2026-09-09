import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createBestTimeService } from './besttime';
import type { GymBaseline } from '../src/types/facilities';
interface PushRegistration { expo_token: string; platform: 'ios' | 'android'; threshold: number; time_zone: string; gym_alerts: boolean; expires_at: string }
export function eligibleRegistration(value: unknown, now: Date): value is PushRegistration {
  const p = value as PushRegistration | null;
  if (!p || !['ios','android'].includes(p.platform) || typeof p.time_zone !== 'string' || !p.time_zone || p.gym_alerts !== true || typeof p.expo_token !== 'string' || !/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(p.expo_token)
    || !Number.isFinite(p.threshold) || p.threshold < 5 || p.threshold > 95 || !(Date.parse(p.expires_at) > now.getTime())) return false;
  try { const hour = Number(new Intl.DateTimeFormat('en', { timeZone: p.time_zone, hour: 'numeric', hourCycle: 'h23' }).format(now)); return hour >= 8 && hour < 22; } catch { return false; }
}
function check(error: unknown) { if (error) throw new Error('Notification worker database operation failed.'); }
export function createNotificationWorker(client: SupabaseClient, baseline: () => Promise<GymBaseline[]> = createBestTimeService(), fetcher = fetch, now = () => new Date()) {
  async function expo(path: string, body: unknown) {
    const response = await fetcher(`https://exp.host/--/api/v2/push/${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Push provider unavailable.');
    return await response.json();
  }
  async function removeInvalid(user: string, installation: string, token: string) { const { error } = await client.rpc('remove_invalid_push_token', { p_user: user, p_installation: installation, p_token: token }); check(error); }
  return async function runOnce() {
    const time = now(); let delivered = 0;
    const { data: pending, error: pendingError } = await client.from('campus_alert_state').select('user_id,installation_id,gym_slug,ticket_id,expo_token,ticket_created_at')
      .eq('receipt_checked', false).lt('ticket_created_at', new Date(time.getTime() - 15 * 60_000).toISOString()).order('ticket_created_at').limit(100);
    check(pendingError);
    if (pending?.length) {
      const response = await expo('getReceipts', { ids: pending.map(p => p.ticket_id) });
      for (const row of pending) {
        const receipt = response.data?.[row.ticket_id];
        if (!receipt && time.getTime() - Date.parse(row.ticket_created_at) < 24 * 3600_000) continue;
        if (receipt?.details?.error === 'DeviceNotRegistered') await removeInvalid(row.user_id, row.installation_id, row.expo_token);
        const { error } = await client.from('campus_alert_state').update({ receipt_checked: true }).eq('user_id', row.user_id).eq('installation_id', row.installation_id).eq('gym_slug', row.gym_slug).eq('ticket_id', row.ticket_id); check(error);
      }
    }
    const gyms = (await baseline()).filter(g => g.status === 'available' && g.baseline !== null && Number.isFinite(g.baseline) && g.baseline >= 0 && g.baseline <= 100 && !g.stale && time.getTime() - Date.parse(g.checkedAt) >= 0 && time.getTime() - Date.parse(g.checkedAt) <= 10 * 60_000);
    if (!gyms.length) return { delivered };
    for (let offset = 0; ; offset += 100) {
      const { data: profiles, error } = await client.from('profiles').select('id,push_tokens').order('id').range(offset, offset + 99); check(error);
      for (const profile of profiles ?? []) for (const [installation, raw] of Object.entries(profile.push_tokens ?? {}).slice(0, 12)) {
        if (!/^[0-9a-f-]{36}$/i.test(installation) || !eligibleRegistration(raw, time)) continue;
        for (const gym of gyms) {
          const { data: claim, error: claimError } = await client.rpc('claim_campus_alert', { p_user: profile.id, p_installation: installation, p_gym: gym.slug, p_below: gym.baseline! < raw.threshold }); check(claimError);
          if (!claim) continue;
          // Claim first: at-most-once send attempts avoid duplicate bursts on ambiguous provider responses.
          const result = await expo('send', { to: raw.expo_token, title: 'A quieter time to train', body: 'A campus gym estimate is below your alert threshold. Check Campus for details and opening hours.',
            data: { kind: 'gym', owner: profile.id, gym: gym.slug }, channelId: 'rulocked-reminders', ttl: 900, sound: 'default', contentAvailable: true });
          if (result.data?.details?.error === 'DeviceNotRegistered') { await removeInvalid(profile.id, installation, raw.expo_token); continue; }
          if (result.data?.status !== 'ok' || typeof result.data.id !== 'string') continue;
          const { error: receiptError } = await client.from('campus_alert_state').update({ ticket_id: result.data.id, expo_token: raw.expo_token, ticket_created_at: time.toISOString(), receipt_checked: false })
            .eq('user_id', profile.id).eq('installation_id', installation).eq('gym_slug', gym.slug); check(receiptError); delivered++;
        }
      }
      if (!profiles || profiles.length < 100) break;
    }
    return { delivered };
  };
}
if (require.main === module) {
  config({ path: 'backend/.env', quiet: true });
  const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configure backend Supabase URL and service-role key for the notification worker.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) } });
  const run = createNotificationWorker(client); let stopping = false;
  const tick = async () => { try { const result = await run(); console.log(JSON.stringify({ event: 'notification.batch', ...result })); } catch { console.error(JSON.stringify({ event: 'notification.batch', status: 'unavailable' })); } if (!stopping) timer = setTimeout(() => void tick(), 300000); };
  let timer: ReturnType<typeof setTimeout> | undefined;
  process.on('SIGTERM', () => { stopping = true; clearTimeout(timer); }); void tick();
}
