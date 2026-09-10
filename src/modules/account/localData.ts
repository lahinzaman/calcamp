import { durableStorage } from '../sync/storage';
import { CAMPUS_REGIONS } from '../background/regions';
export function removeLocalAccountData(owner: string) {
  const keys = ['account', 'profile', 'notifications', 'push-registered', 'rescue-prefetch', 'geofence-started', 'geofence-regions'].map(prefix => `${prefix}:${owner}`);
  for (const region of CAMPUS_REGIONS) for (const prefix of ['geofence-inside', 'rescue-prefetch-at', 'notification-cooldown']) keys.push(`${prefix}:${owner}:${region.identifier}`);
  for (const key of keys) durableStorage.remove(key);
  if (durableStorage.get('active-sync-owner') === owner) durableStorage.remove('active-sync-owner');
  if (durableStorage.get('geofence-owner') === owner) durableStorage.remove('geofence-owner');
}
