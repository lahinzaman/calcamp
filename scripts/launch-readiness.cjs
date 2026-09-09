// Run explicitly before public release; empty placeholders do not break local builds.
process.env.NODE_ENV ??= 'production';
require('@expo/env').load(process.cwd());
let invalid = false;
for (const key of ['EXPO_PUBLIC_PRIVACY_POLICY_URL', 'EXPO_PUBLIC_SUPPORT_URL']) {
  try {
    const url = new URL(process.env[key] ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /(^|\.)(example\.(com|org|net)|localhost)$/.test(url.hostname)) throw new Error();
  } catch { console.error(`Configure ${key} with your published HTTPS page before App Store launch.`); invalid = true; }
}
if (invalid) process.exit(1);
require('./release-readiness.cjs');
