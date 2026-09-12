import { getSupabase } from './supabase';
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
export const fetchMacroRescue = (location: Coordinates, remaining: MacroTotals, preference: MacroPreference, signal: AbortSignal) => campusRequest<RescueResponse>('rescue', signal, { location, remaining, preference });
