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
  assert.equal(ios.entitlements['com.apple.developer.healthkit'], true);
  assert.ok(ios.infoPlist.NSHealthShareUsageDescription);
  assert.ok(ios.infoPlist.NSHealthUpdateUsageDescription);
  assert.ok(ios.infoPlist.NSLocationWhenInUseUsageDescription);
  assert.equal(!!ios.infoPlist.NSAppTransportSecurity?.NSAllowsArbitraryLoads, variant === 'development');
  const manifest = android.manifest.manifest;
  const permissions = manifest['uses-permission'].map(p => p.$['android:name']);
  for (const permission of ['READ_STEPS', 'READ_ACTIVE_CALORIES_BURNED', 'WRITE_EXERCISE', 'WRITE_NUTRITION']) assert.ok(permissions.includes(`android.permission.health.${permission}`));
  assert.equal(manifest.application[0].$['android:usesCleartextTraffic'], String(variant === 'development'));
  assert.ok(manifest.application[0]['activity-alias'].some(a => a.$['android:name'] === 'ViewPermissionUsageActivity'));
  assert.ok(config.plugins.some(p => (Array.isArray(p) ? p[0] : p) === '@rnmapbox/maps'));
  assert.ok(config.ios.bundleIdentifier); assert.ok(config.android.package);
  console.log(`${variant}: native permissions, HealthKit entitlements, Health Connect rationale, Mapbox plugin, and transport policy verified.`);
}
