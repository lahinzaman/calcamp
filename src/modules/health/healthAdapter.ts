import type { HealthAdapter } from './types';
export async function getHealthAdapter(): Promise<HealthAdapter> {
  throw new Error('Health sync requires an iOS or Android development build.');
}
