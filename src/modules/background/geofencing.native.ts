import * as Location from 'expo-location';
import { CAMPUS_REGIONS } from './regions';
import { durableStorage } from '../sync/storage';
import { readPreferences } from '../notifications/preferences';
export const GEOFENCE_TASK = 'rulocked-campus-geofence-v1';
let chain = Promise.resolve();
function serialize(work: () => Promise<void>) { const next = chain.then(work, work); chain = next.catch(() => {}); return next; }
async function stop() { if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK); }
export function stopGeofencing() { return serialize(stop); }
export function configureGeofencing(owner: string, enabled: boolean, request = false) {
  return serialize(async () => {
    if (durableStorage.get('active-sync-owner') !== owner) return;
    if (!enabled) { await stop(); return; }
    let foreground = await Location.getForegroundPermissionsAsync();
    if (request && !foreground.granted) foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) throw new Error('Location access is required for campus arrival alerts.');
    let background = await Location.getBackgroundPermissionsAsync();
    if (request && !background.granted) background = await Location.requestBackgroundPermissionsAsync();
    if (!background.granted) throw new Error('Choose Always Allow location in Settings for campus arrival alerts.');
    if (durableStorage.get('active-sync-owner') !== owner || !readPreferences(owner).geofencing) return;
    // Re-registering on every foreground would emit new initial-state callbacks on iOS.
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK) && durableStorage.get('geofence-owner') === owner) return;
    durableStorage.set('geofence-owner', owner);
    durableStorage.set(`geofence-started:${owner}`, String(Date.now()));
    await Location.startGeofencingAsync(GEOFENCE_TASK, CAMPUS_REGIONS);
  });
}
