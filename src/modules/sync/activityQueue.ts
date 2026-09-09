import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { syncEngine } from './runtime';
import type { HealthSummary } from '../health/types';
export function queueActivitySnapshot(summary: HealthSummary, owner: string) {
  if (owner !== syncEngine.owner || !['ios','android'].includes(Platform.OS)) return;
  const latest = syncEngine.data.queue.filter(q => q.kind === 'activity').at(-1);
  if (latest?.kind === 'activity' && latest.data.date === summary.date && latest.data.steps === summary.steps && latest.data.activeEnergyKcal === summary.activeEnergyKcal) return;
  syncEngine.queue({ kind: 'activity', data: { ...summary, source: Platform.OS === 'ios' ? 'healthkit' : 'health-connect', observedAt: new Date().toISOString() } }, randomUUID());
}
