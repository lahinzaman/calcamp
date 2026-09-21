import type { HealthSummary } from '../modules/health/types';
import { getSupabase } from './supabase';

/**
 * A day's activity from one source. `treadmill` is the day's running total read off consoles,
 * not a single session: the sync queue retries, and a write that added would count a session
 * again on every retry, so the device owns the total and each upload replaces it.
 */
export interface ActivitySnapshot extends HealthSummary {
  source: 'healthkit' | 'health-connect' | 'treadmill';
  observedAt: string;
  /** What the console showed. Only a manual source carries these; the schema enforces that. */
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  /** Whether the steps were displayed by the machine or derived from distance and stride. */
  stepsEstimated?: boolean;
}
export async function saveActivitySnapshot(owner: string, snapshot: ActivitySnapshot) {
  const { error } = await getSupabase().rpc('save_activity_snapshot', { p_owner: owner, p_date: snapshot.date, p_source: snapshot.source,
    p_steps: snapshot.steps, p_energy: snapshot.activeEnergyKcal, p_observed_at: snapshot.observedAt,
    p_distance_m: snapshot.distanceMeters ?? null, p_duration_seconds: snapshot.durationSeconds ?? null,
    p_steps_estimated: snapshot.stepsEstimated ?? false });
  if (error) throw Object.assign(new Error('Health backup could not be saved.'), { code: error.code });
}
