// EAS reads eas.json; it does not expand environment variables inside JSON.
// Only the public numeric app ID is materialized. Private keys stay in EAS credentials.
const fs = require('node:fs');
require('@expo/env').load(process.cwd());
const id = process.env.APP_STORE_CONNECT_APP_ID?.trim();
if (!id || !/^\d+$/.test(id)) { console.error('Set APP_STORE_CONNECT_APP_ID to the numeric Apple ID from App Store Connect.'); process.exit(1); }
const config = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
config.submit.production.ios = { ...config.submit.production.ios, ascAppId: id };
fs.writeFileSync('eas.json', JSON.stringify(config, null, 2) + '\n');
console.log('Updated eas.json with the public App Store Connect app ID. Review and commit before building.');
