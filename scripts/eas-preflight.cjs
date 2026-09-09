process.env.NODE_ENV ??= 'production';
require('@expo/env').load(process.cwd());
const { getConfig } = require('expo/config');
const variant = process.env.APP_VARIANT ?? process.env.EAS_BUILD_PROFILE ?? 'production';
process.env.APP_VARIANT = variant;
const { exp } = getConfig(process.cwd());
const failures = [];
const required = key => { if (!process.env[key]) failures.push(`Set ${key} in the ${variant} EAS environment.`); };
for (const key of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN', 'EXPO_PUBLIC_BACKEND_URL', 'EXPO_PUBLIC_VISION_PROXY_URL']) required(key);
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(exp.extra?.eas?.projectId ?? '')) failures.push('Link an EAS project and provide EAS_PROJECT_ID.');
for (const key of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_BACKEND_URL', 'EXPO_PUBLIC_VISION_PROXY_URL']) {
  const value = process.env[key]; if (!value) continue;
  try { const url = new URL(value); if (url.protocol !== 'https:' && !(variant === 'development' && url.protocol === 'http:')) throw new Error(); }
  catch { failures.push(`${key} must be a valid ${variant === 'development' ? 'HTTP(S)' : 'HTTPS'} URL.`); }
}
const plugins = (exp.plugins ?? []).map(p => Array.isArray(p) ? p[0] : p);
for (const name of ['react-native-health', 'react-native-health-connect', '@rnmapbox/maps', 'expo-build-properties', 'expo-location', 'expo-secure-store', 'expo-sqlite', 'expo-background-task', 'expo-notifications']) if (!plugins.includes(name)) failures.push(`Missing native plugin: ${name}`);
if (process.env.EXPO_PUBLIC_SENTRY_DSN?.trim()) {
  if (!/^https:\/\/[^@\s]+@[^\s]+\/\d+$/.test(process.env.EXPO_PUBLIC_SENTRY_DSN.trim())) failures.push('EXPO_PUBLIC_SENTRY_DSN must be a valid HTTPS Sentry DSN.');
  if (!plugins.includes('@sentry/react-native/expo')) failures.push('Missing Sentry upload plugin.');
  for (const key of ['SENTRY_ORG','SENTRY_PROJECT']) required(key);
  if (process.env.EAS_BUILD === 'true') required('SENTRY_AUTH_TOKEN');
  if (variant === 'production' && [process.env.SENTRY_DISABLE_AUTO_UPLOAD, process.env.SENTRY_ALLOW_FAILURE].includes('true')) failures.push('Production Sentry uploads must be enabled and upload failures must fail the build.');
} else console.log('Sentry is disabled until EXPO_PUBLIC_SENTRY_DSN is configured.');
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`EAS ${variant} configuration preflight passed. Signing credentials and native compilation are checked by EAS Build.`);
