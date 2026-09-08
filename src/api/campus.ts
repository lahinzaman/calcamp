import { durableStorage } from '../modules/sync/storage';
import { getSupabase } from './supabase';
import type { CrowdStatus, GymBaseline, GymSlug, GymSummary } from '../types/facilities';
import type { Coordinates, MacroPreference, RescueResponse } from '../types/rescue';
import type { MacroTotals } from '../types/nutrition';
async function campusRequest<T>(path: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const configured = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!configured) throw new Error('Configure the campus backend URL.');
  const url = new URL(configured);
  if (url.protocol !== 'https:' && !(typeof __DEV__ !== 'undefined' && __DEV__ && url.protocol === 'http:')) throw new Error('Campus services require HTTPS outside development.');
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) throw new Error('Sign in to use campus services.');
  const timeout = new AbortController(); const timer = setTimeout(() => timeout.abort(), 25_000);
  const cancel = () => timeout.abort(); signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    const response = await fetch(new URL(`/api/campus/${path}`, url), { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: timeout.signal });
    if (!response.ok) throw new Error(response.status === 401 ? 'Session expired. Sign in again.' : response.status === 409 ? 'Macro rescue is available from 10 PM to midnight Eastern with more than 400 kcal remaining.' : 'Campus service unavailable. Try again shortly.');
    return await response.json() as T;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
export async function fetchGymBaselines(signal: AbortSignal): Promise<GymBaseline[]> {
  const key = 'campus:gyms'; let cached: { data: GymBaseline[]; at: number } | null = null;
  try { const raw = durableStorage.get(key); cached = raw ? JSON.parse(raw) : null; } catch { /* Cache failure never blocks a live read. */ }
  if (signal.aborted) throw new Error('Request cancelled.');
  if (cached && (!Number.isFinite(cached.at) || !Array.isArray(cached.data) || cached.data.some(g => !g || typeof g.slug !== 'string' || (g.baseline !== null && (!Number.isFinite(g.baseline) || g.baseline < 0 || g.baseline > 100))))) cached = null;
  if (cached && Date.now() - cached.at < 300_000) return cached.data;
  try {
    const data = await campusRequest<GymBaseline[]>('gyms', signal);
    if (!Array.isArray(data) || data.some(g => g.baseline !== null && (!Number.isFinite(g.baseline) || g.baseline < 0 || g.baseline > 100))) throw new Error('Invalid gym response.');
    try { durableStorage.set(key, JSON.stringify({ data, at: Date.now() })); } catch { /* Live data remains usable. */ }
    return data;
  } catch (error) {
    if (!signal.aborted && cached && Date.now() - cached.at < 3600_000) return cached.data.map(g => ({ ...g, stale: true }));
    throw error;
  }
}
export const fetchMacroRescue = (location: Coordinates, remaining: MacroTotals, preference: MacroPreference, signal: AbortSignal) => campusRequest<RescueResponse>('rescue', signal, { location, remaining, preference });
export async function fetchGymSummary(signal: AbortSignal): Promise<GymSummary[]> {
  const { data, error } = await getSupabase().rpc('get_gym_busyness').abortSignal(signal);
  if (error) throw new Error('Community reports are unavailable. Please try again.');
  return (data ?? []) as GymSummary[];
}
export async function submitGymVote(slug: GymSlug, status: CrowdStatus) {
  const client = getSupabase(); const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Sign in to vote.');
  const { error: insertError } = await client.from('gym_busyness_votes').insert({ user_id: data.user.id, location_slug: slug, status });
  if (insertError) throw new Error('Your vote could not be saved. Please try again.');
}
