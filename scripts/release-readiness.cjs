// Explicit release gate; local/placeholder builds remain usable without external accounts.
require('@expo/env').load(process.cwd());
const config = require('../eas.json');
const missing = ['EXPO_PUBLIC_SENTRY_DSN', 'SENTRY_ORG', 'SENTRY_PROJECT', 'APP_STORE_CONNECT_APP_ID'].filter(key => !process.env[key]?.trim());
if (missing.length) { console.error(`Before TestFlight, configure: ${missing.join(', ')}.`); process.exit(1); }
if (!/^\d+$/.test(process.env.APP_STORE_CONNECT_APP_ID) || config.submit.production.ios.ascAppId !== process.env.APP_STORE_CONNECT_APP_ID) {
  console.error('Run npm run submit:prepare with your numeric App Store Connect app ID, then review eas.json.'); process.exit(1);
}
process.env.APP_VARIANT = 'production';
require('./eas-preflight.cjs');
if (!process.exitCode) console.log('Local release configuration passed. Confirm remote Sentry upload credentials, Apple signing credentials, migration, worker deployment, and physical-device checklist before distribution.');
