import type { HealthSummary } from '../modules/health/types';
import { getSupabase } from './supabase';
export interface ActivitySnapshot extends HealthSummary { source: 'healthkit' | 'health-connect'; observedAt: string }
export async function saveActivitySnapshot(owner: string, snapshot: ActivitySnapshot) {
  const { error } = await getSupabase().rpc('save_activity_snapshot', { p_owner: owner, p_date: snapshot.date, p_source: snapshot.source,
    p_steps: snapshot.steps, p_energy: snapshot.activeEnergyKcal, p_observed_at: snapshot.observedAt });
  if (error) throw Object.assign(new Error('Health backup could not be saved.'), { code: error.code });
}
