# Phase 6 — Release candidate implementation and TestFlight checklist

Implemented against Expo SDK 57. Phase 5's verified HealthKit bridge patch, durable SQLite outbox, and nutrition receipt protocol remain in place. This change adds notification registration, local reminders, campus geofences, daily activity backups, Sentry integration, and release configuration. The migration, worker deployment, Apple signing, and new physical-device checks below have **not** been run against production as part of this change.

## What runs where

| Component | Behavior |
| --- | --- |
| `index.js` | Initializes telemetry and registers background tasks before Expo Router mounts, including cold task launches. |
| `src/modules/notifications/` | Opt-in preferences, APNs/FCM + Expo token registration, foreground presentation, account-checked tap routes, stable local schedules, token rotation/reconnection reconciliation, and logout cleanup. Settings are available on the Campus tab. |
| `src/modules/background/` | Seven low-power campus regions, arrival deduplication, background sync wakeups, and short-lived macro-rescue prefetches consumed by the Dining tab. No continuous GPS stream. |
| `src/modules/sync/background.native.ts` | Existing OS-scheduled task requests a 15-minute minimum interval and now uploads opted-in daily HealthKit snapshots through the outbox. |
| `src/api/activity.ts` | Owner-checked RPC replaces steps/active-energy snapshots by observation time. Replayed or older observations cannot increment totals. Food calories and lifting volume are separate. |
| `backend/notification-worker.ts` | Dedicated long-running worker checks fresh BestTime estimates every five minutes, claims threshold crossings in PostgreSQL, sends generic gym alerts, and checks Expo delivery receipts. |
| `src/modules/telemetry/` | Optional Sentry native/JS reporting, wrapped root and screen boundaries, allowlisted queue/health/fallback breadcrumbs. Health values, images, tokens, GPS coordinates, users, requests, and arbitrary extras are excluded from application telemetry. |

Local reminders use the device calendar/time zone: one optional daily diary/planned-refeed reminder and four advanced-track weekly Upper A / Lower A / Upper B / Lower B reminders. Casual users do not receive an invented training schedule. Gym alerts use the time zone last registered by the device, between 08:00 and 22:00. Foregrounding after travel updates it.

The new `profiles` table is a private one-to-one extension of the existing `users` table; onboarding and body metrics remain in `users`. `push_tokens` maps installation UUIDs to registrations so multiple phones do not overwrite each other. APNs/FCM native tokens are stored alongside Expo tokens; the worker sends through Expo, which delivers through APNs/FCM. `daily_activity_snapshots` and the service-only `campus_alert_state` table are introduced in the same migration.

## Environment placeholders

`.env.example` contains empty placeholders. Put the real values in ignored `.env.local`, and configure the corresponding **production EAS environment** before the release build:

| Variable | Where | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_SENTRY_DSN` | App/local + EAS production, public | Sentry ingestion DSN. Empty means no runtime reporting or native upload hooks. |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Local + EAS production, available during config evaluation | Organization/project slugs for native source maps and debug symbols. |
| `SENTRY_AUTH_TOKEN` | EAS production **secret**, optionally local shell for an archive | Token authorized to upload source maps/debug symbols for this project. Never prefix it with `EXPO_PUBLIC_`. |
| `APP_STORE_CONNECT_APP_ID` | Local/CI release preparation | Numeric Apple ID from App Store Connect App Information. No dummy ID is embedded. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Render background worker only** | Reads registrations and executes service-only alert claims/receipt cleanup. Never use the mobile publishable key here or put this key in the app. |
| `EXPO_ACCESS_TOKEN` | Render worker secret | Configure when Expo enhanced push security is enabled. Recommended before distributing the RC. |

Keep the existing public Supabase/Mapbox configuration and HTTPS Render URLs. `.env.local` is not uploaded to EAS; set the variables in EAS as well. Public app variables and Sentry org/project must be available for local configuration evaluation, rather than stored exclusively as unreadable EAS secrets. Private signing/upload `.p8` files are ignored by Git.

Empty Sentry placeholders are supported for development and production-shaped local builds. `npm run release:check` deliberately fails until release identifiers are populated. After setting a DSN, native source-map hooks are added during prebuild; build a new native binary. When Sentry is configured, cloud preflight requires the upload token. Production preflight rejects `SENTRY_ALLOW_FAILURE=true` and `SENTRY_DISABLE_AUTO_UPLOAD=true` so an RC does not silently lose symbolication. See [Expo's Sentry setup](https://docs.expo.dev/guides/using-sentry/).

## Database and worker rollout

1. Review `supabase/migrations/20260908162821_phase6_notifications_activity.sql`. It uses explicit grants, per-user RLS, owner parameters checked against `auth.uid()`, and service-only alert RPCs. Existing diary/workout tables are untouched.
2. With the intended Supabase project linked and CLI credentials configured, inspect pending changes and apply them before installing the Phase 6 app:

   ```sh
   npx supabase migration list
   npx supabase db push --dry-run
   npx supabase db push
   ```

3. Create a **Render Background Worker**, using the same repository and branch as the backend. Build command: `npm ci && npm run backend:build`. Start command: `npm run backend:notifications`. Supply `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BESTTIME_API_KEY`, and the optional `EXPO_ACCESS_TOKEN`. Keep the existing web service for campus/vision endpoints. Do not add an unauthenticated “send notification” HTTP route.
4. Start with one worker instance. Its BestTime cache stays warm across checks. A persistent worker avoids rebuilding the provider baseline on every cron invocation. Only fresh, available estimates trigger alerts; stale/outage fallback data never triggers one.
5. Verify opt-in registration and receipt processing using a designated test account/device. Worker logs contain batch status/counts, not registration tokens or user health information. Stop the worker to pause all remote gym alerts; local reminders continue until disabled in the app.

The worker sends on a below-threshold transition, with a four-hour per-installation/per-gym cooldown. Claims precede network requests: ambiguous network failures can miss an alert, rather than repeatedly notify someone. An accepted Expo ticket is **not** proof of delivery; receipt polling starts after 15 minutes. `DeviceNotRegistered` removes the matching token only, so a rotated token survives an old receipt. Registrations expire after 30 days without refresh. See [Expo delivery tickets and receipts](https://docs.expo.dev/push-notifications/sending-notifications/).

Logout cancels local reminders and geofences and attempts server deregistration. If the device is offline, already registered generic gym alerts can persist until deregistration/lease expiry. They contain no diary or health metrics. Account checks prevent an old account's tap/background payload from opening the new account's routes or uploading its health data.

## Apple and EAS setup

1. Ensure Apple Developer Program membership and App Store Connect access for the correct team. In Certificates, Identifiers & Profiles, register the production bundle identifier (`com.rulocked.app` unless intentionally overridden). Enable **HealthKit** and **Push Notifications**. Do not use the `.development` or `.preview` app identifiers for TestFlight.
2. In App Store Connect, create the iOS app record with that identifier, a unique SKU, and the intended name/language. Copy the numeric **Apple ID** from App Information into `APP_STORE_CONNECT_APP_ID`.
3. Under App Store Connect Users and Access → Integrations → App Store Connect API, create an upload API key with an appropriate role (typically App Manager). Record its issuer ID/key ID and download the `.p8` once into private storage. Configure it through EAS's submission credential prompts. This is separate from the APNs notification key.
4. Run the project's pinned EAS wrapper and select the **production** profile/team:

   ```sh
   npm run eas -- login
   npm run eas -- project:info
   npm run eas -- credentials --platform ios
   ```

   Let EAS generate or reuse the **Apple Distribution Certificate** and matching **App Store provisioning profile** for the production identifier. Configure the **APNs key** for push delivery and the App Store Connect upload key under submission credentials. Regenerate the provisioning profile if capabilities changed after it was created. Do not revoke certificates used by other apps.
5. Check that the EAS project is `83bb9069-dd83-4d41-bfa5-a760d7d1c06a`, the correct Expo owner is selected, and the production environment contains the required app/telemetry variables. Android distribution additionally requires FCM v1 credentials in EAS; it is not covered by the iOS TestFlight submission.

EAS restores the certificate/profile, checks their compatibility, prebuilds the ignored native folders, installs pods, and archives the Release target. `production` uses store distribution, remote signing credentials, automatic build-number increments, and a physical-device Release binary. `cli.requireCommit` is enabled for reproducibility. See [EAS iOS build steps](https://docs.expo.dev/build-reference/ios-builds/) and [App Store submission setup](https://docs.expo.dev/submit/ios/).

## Build and submit pipeline

Run from the repository root after configuring the accounts above:

```sh
npm ci
npm run submit:prepare
npm run typecheck
npm test
npm run backend:build
npm run verify:native
npm run eas:preflight
npm run release:check
git diff --check
git status --short
```

`submit:prepare` materializes only the public numeric app ID into `eas.json`; EAS does not interpolate `${ENV}` inside JSON. Review and commit the Phase 6 changes and that app ID before building. It intentionally exits without changing files if the app ID is empty. Private upload keys remain in EAS credentials.

```sh
npm run eas -- build --platform ios --profile production
```

Wait for a successful archive. Record the returned **build ID**, Git revision and build number. Confirm source-map/debug-symbol upload in the logs. Submit that exact build:

```sh
npm run eas -- submit --platform ios --profile production --id YOUR_SUCCESSFUL_BUILD_ID
```

These wrap `eas build --platform ios --profile production` and `eas submit --platform ios --profile production --id ...` with the pinned CLI. Prefer the explicit build ID over `--latest` when development/preview builds also exist. Do not use an empty app ID or substitute the EAS UUID for Apple's numeric app ID.

In App Store Connect → TestFlight, wait for processing, complete export-compliance and beta information, select the processed build, and add it to an internal testing group. External testing requires the relevant beta review. Submission uploads a build; it does not publish the app to the App Store. Complete privacy disclosures, support/privacy URLs, review instructions, screenshots and account-deletion requirements before a public release; this implementation does not declare that review work complete.

## Physical iPhone release verification

Run on the **new Phase 6 native build**, and repeat the critical cases on the TestFlight Release binary without Metro/debugger. Phase 5's successful hardware run does not verify these newly added native modules.

- [ ] Fresh install and existing-account upgrade both load with empty notification/Sentry preferences. No notification or Always-location prompt appears until settings are explicitly saved with the relevant option enabled.
- [ ] Allow notifications; verify one installation entry has native APNs and Expo tokens in the current user's `profiles` row. Another account cannot read it. Reopen, rotate/reinstall as practical, and reconnect after offline registration failure; no duplicate schedules accumulate.
- [ ] Test a local diary reminder and each selected weekly Upper/Lower day. Check device time-zone changes and denied/provisional permissions. Repeated saves replace schedules. Disable notifications and confirm scheduled notifications are removed.
- [ ] Trigger a test account's gym crossing with controlled test data/provider fixtures. Verify generic foreground/background alert, correct Campus tap route, four-hour cooldown, stale-baseline suppression and receipt processing. Avoid altering real facility estimates for other users.
- [ ] Test cold-start notification taps before and after auth/profile hydration. Old-account or unknown payloads must not navigate. Data-only push wake testing uses an owner-bound `{kind:"sync",owner:"<test user UUID>"}` payload, `contentAvailable:true`, no title/body, and normal priority; send only to the explicitly designated test device.
- [ ] Deny location, grant While Using, then grant Always via Settings. Confirm clear prompts and no background permission dialogs. Walk out of and back into a campus region; initial inside state and duplicate callbacks must not generate bursts. Test overlapping College Ave dining/gym regions; cooldowns are per-region.
- [ ] After 22:00 New York time with over 400 kcal remaining, enter a dining region. Verify a prefetched result is available on Dining, still fits all current macros, expires after five minutes, and shows when opening hours were checked. Changing macros invalidates the saved search. No verified match means no meal prompt.
- [ ] Connect Health, explicitly enable activity backup, background/lock the phone, and inspect `daily_activity_snapshots` after OS-permitted runs. Replay a batch/offline reconnection: totals replace rather than add. Food calorie totals and workout volume must stay unchanged. Disable backup before draining and verify queued activity uploads are discarded rather than uploaded.
- [ ] Test denied/revoked Health access, Low Power Mode, Airplane Mode, account switching during an in-flight sync, and force quit/relaunch. Keep queued diary/workout edits intact; no old-owner data may be written to the new account.
- [ ] With the real Sentry DSN configured, trigger a deliberate test JS error and native crash in a temporary **test-only** harness. Relaunch and verify symbolicated JS/native reports with build identity; remove the harness before distribution. Inspect event payloads for health inputs, account data, coordinates and secrets. They must be absent.
- [ ] Inspect the signed IPA entitlements/provisioning profile for production APNs and HealthKit. Check notification/background/location descriptions in Settings. Verify the existing `react-native-health` patch still applies during a clean cloud install.
- [ ] Test online and offline logout, confirm local notification/geofence cleanup, and document the offline remote-token lease limitation to testers.

The OS controls background execution. Fifteen minutes is a **requested minimum**, not a timer or guaranteed upload SLA; force quit, disabled background refresh, locked HealthKit data and power policy may prevent execution. Visible notifications with content-available do not guarantee a terminated app wake; data-only headless messages have their own OS restrictions. Foreground reconciliation remains the recovery path. On Android, Health Connect background reading also depends on platform permissions/support; this phase's silent health-backup acceptance target is iOS. See [Expo 57 BackgroundTask](https://docs.expo.dev/versions/v57.0.0/sdk/background-task/), [notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) and [location/geofencing](https://docs.expo.dev/versions/v57.0.0/sdk/location/).

## Verification completed locally

- `npm test`: 108 passing tests, including native API mocks, notification policy/registration, background payload guards, geofence permission/reentry behavior, snapshot coalescing, token receipts, telemetry scrubbing and local PostgreSQL RLS/idempotency.
- `npm run typecheck`: app and backend pass.
- Native configuration introspection: development, preview and production pass with empty telemetry settings; configured-Sentry plugin path also checked.
- Production Expo export: iOS, Android and static web bundles generated. Expo reported a forced shutdown after completing the export; no native archive or device execution is implied by bundling.
- EAS JSON schema and local production preflight checked. Cloud signing/compilation, live Sentry delivery, production migration, worker deployment and TestFlight upload remain rollout tasks above.

Approximate geofence points were checked against [Rutgers Atrium location](https://webapps.rutgers.edu/study-spaces/College-Avenue-Student-Center-Atrium-Food-Court), [Busch](https://mapcarta.com/W251381349), [Livingston](https://mapcarta.com/W251381978), [Werblin](https://topoquest.com/place/new-jersey/building/sonny-werblin-recreation-center/2104676), [Neilson entrance photo location](https://commons.wikimedia.org/wiki/File:2021-05-24_16_26_38_The_James_Neilson_Dining_Hall_on_the_Cook-Douglass_Campus_of_Rutgers_University_in_New_Brunswick,_Middlesex_County,_New_Jersey.jpg), [College Avenue Gym](https://latitude.to/map/us/united-states/cities/south-plainfield/articles/96855/college-avenue-gymnasium), and [Cook/Douglass vicinity](https://topoquest.com/place/new-jersey/building/cook-campus-center/2104667). The 150 m regions are arrival hints, not entrance-level location claims; field-test them on campus before wider rollout.
