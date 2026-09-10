import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { durableStorage } from '../sync/storage';
import { savePreferences } from '../notifications/preferences';
import { defaultPreferences } from '../notifications/policy';
let foreground = true; let background = false; let started = false; let prompts = 0; let starts = 0;
mock.module('expo-location', { namedExports: {
  getForegroundPermissionsAsync: async () => ({ granted: foreground }), getBackgroundPermissionsAsync: async () => ({ granted: background }),
  requestForegroundPermissionsAsync: async () => { prompts++; return { granted: foreground }; }, requestBackgroundPermissionsAsync: async () => { prompts++; return { granted: background }; },
  hasStartedGeofencingAsync: async () => started, stopGeofencingAsync: async () => { started = false; },
  startGeofencingAsync: async (_name: string, regions: unknown[]) => { assert.equal(regions.length, 8); started = true; starts++; },
} });
test('geofencing never prompts from background and reconciles registration once per account', async () => {
  const { configureGeofencing, stopGeofencing } = await import('../background/geofencing.native');
  durableStorage.set('active-sync-owner', 'alice'); savePreferences('alice', { ...defaultPreferences, geofencing: true });
  await assert.rejects(configureGeofencing('alice', true), /Always Allow/); assert.equal(prompts, 0);
  background = true; await configureGeofencing('alice', true); await configureGeofencing('alice', true); assert.equal(starts, 1);
  durableStorage.set('active-sync-owner', 'bob'); await configureGeofencing('alice', true); assert.equal(starts, 1);
  await stopGeofencing(); assert.equal(started, false);
  foreground = false; savePreferences('bob', { ...defaultPreferences, geofencing: true });
  await assert.rejects(configureGeofencing('bob', true), /Location access/); assert.equal(prompts, 0);
});
