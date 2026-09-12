const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const variant of ['development', 'preview', 'production']) {
  const result = spawnSync(process.execPath, [path.resolve('node_modules/expo/bin/cli'), 'config', '--type', 'introspect', '--json'], {
    env: { ...process.env, APP_VARIANT: variant }, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Expo ${variant} introspection failed: ${result.stderr}`);
  const config = JSON.parse(result.stdout);
  const ios = config._internal.modResults.ios;
  const android = config._internal.modResults.android;
  assert.equal(config.name, variant === 'production' ? 'CalCamp' : `CalCamp ${variant === 'development' ? 'Dev' : 'Preview'}`);
  assert.equal(ios.infoPlist.CFBundleDisplayName, config.name);
  // Google Sans is loaded at runtime by useFonts, so nothing should be embedded natively —
  // least of all the Manjari files this app no longer ships.
  assert.equal(ios.infoPlist.UIAppFonts, undefined);
  const authScheme = variant === 'production' ? 'calcamp' : `calcamp-${variant}`;
  assert.ok(ios.infoPlist.CFBundleURLTypes.some(type => type.CFBundleURLSchemes.includes(authScheme)));
  assert.equal(android.strings.resources.string.find(entry => entry.$.name === 'app_name')._, config.name);
  const profile = require('../eas.json').build[variant];
  assert.equal(profile.channel, { development: 'development', preview: 'testing', production: 'production' }[variant]);
  assert.equal(config.runtimeVersion.policy, 'fingerprint');
  assert.equal(ios.expoPlist.EXUpdatesEnabled, true);
  assert.equal(ios.expoPlist.EXUpdatesURL, `https://u.expo.dev/${config.extra.eas.projectId}`);
  assert.equal(ios.expoPlist.EXUpdatesCheckOnLaunch, 'ALWAYS');
  assert.equal(ios.expoPlist.EXUpdatesLaunchWaitMs, 0);
  assert.equal(ios.expoPlist.EXUpdatesRuntimeVersion, 'file:fingerprint');
  assert.equal(ios.entitlements['com.apple.developer.healthkit'], true);
  assert.ok(ios.infoPlist.NSCameraUsageDescription?.includes('CalCamp'));
  assert.equal(ios.entitlements['com.apple.developer.applesignin'], undefined);
  assert.ok(ios.infoPlist.NSHealthShareUsageDescription);
  assert.ok(ios.infoPlist.NSHealthUpdateUsageDescription);
  assert.ok(ios.infoPlist.NSLocationWhenInUseUsageDescription);
  assert.equal(!!ios.infoPlist.NSAppTransportSecurity?.NSAllowsArbitraryLoads, variant === 'development');
  for (const mode of ['processing','remote-notification','location']) assert.ok(ios.infoPlist.UIBackgroundModes?.includes(mode));
  assert.ok(ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription);
  assert.equal(ios.entitlements['aps-environment'], variant === 'development' ? 'development' : 'production');
  assert.ok(ios.infoPlist.BGTaskSchedulerPermittedIdentifiers?.includes('com.expo.modules.backgroundtask.processing'));
  for (const name of ['expo-sqlite', 'expo-background-task', 'expo-notifications']) assert.ok(config.plugins.some(p => (Array.isArray(p) ? p[0] : p) === name));
  if (process.env.EXPO_PUBLIC_SENTRY_DSN?.trim()) assert.ok(config.plugins.some(p => (Array.isArray(p) ? p[0] : p) === '@sentry/react-native/expo'));
  const manifest = android.manifest.manifest;
  const permissions = manifest['uses-permission'].map(p => p.$['android:name']);
  for (const permission of ['READ_STEPS', 'READ_ACTIVE_CALORIES_BURNED', 'WRITE_EXERCISE', 'WRITE_NUTRITION']) assert.ok(permissions.includes(`android.permission.health.${permission}`));
  assert.ok(permissions.includes('android.permission.CAMERA'));
  assert.ok(!permissions.includes('android.permission.RECORD_AUDIO'));
  for (const permission of ['ACCESS_BACKGROUND_LOCATION', 'POST_NOTIFICATIONS']) assert.ok(permissions.includes(`android.permission.${permission}`));
  assert.equal(manifest.application[0].$['android:usesCleartextTraffic'], String(variant === 'development'));
  assert.ok(manifest.application[0]['activity-alias'].some(a => a.$['android:name'] === 'ViewPermissionUsageActivity'));
  assert.ok(config.plugins.some(p => (Array.isArray(p) ? p[0] : p) === '@rnmapbox/maps'));
  assert.ok(config.ios.bundleIdentifier); assert.ok(config.android.package);
  const metadata = manifest.application[0]['meta-data'];
  assert.equal(metadata.find(m => m.$['android:name'] === 'expo.modules.updates.ENABLED').$['android:value'], 'true');
  assert.equal(metadata.find(m => m.$['android:name'] === 'expo.modules.updates.EXPO_UPDATE_URL').$['android:value'], config.updates.url);
  console.log(`${variant}: OTA fingerprint, channel, native permissions, HealthKit, Health Connect, Mapbox, background scheduling, SQLite, camera/barcodes without microphone permission, and transport policy verified.`);
}
