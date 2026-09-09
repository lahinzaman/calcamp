# Phase 7: OTA, feedback, and launch runbook

Implemented locally; no hosted migration, backend deployment, EAS channel mutation, update publication, or account deletion was performed during verification. Phase 6 physical verification does not cover these new native dependencies. Build and install a new Phase 7 binary before testing OTA.

## Changes

- `app.json` / `app.config.ts`: Expo Updates project URL, fingerprint runtime compatibility, automatic launch checks with zero launch wait. Previously downloaded updates apply on the next launch; Settings offers check/download and an explicit restart. Restart is disabled during an active workout or sync. Offline edits remain in durable storage.
- `eas.json`: development → development channel, preview → testing channel, production → production channel. Remote channel-to-branch mappings are configured below.
- Settings: native version/build, full runtime/channel and abbreviated OTA ID, reminders, feedback, privacy/support links, visible account deletion. Empty public page URLs display a friendly notice; `npm run launch:check` rejects them before public launch.
- Feedback: authenticated, owner-scoped, idempotent RPC; five reports per rolling 24 hours; 10–4,000 characters; whitelisted, bounded device context; no automatic health data collection. Failed submission retains the open modal's draft and retry ID. Closing the modal discards an unsent draft.
- Dining and active workout sets use FlashList v2 with row types and stable identities. Workout input state resets when a recycled cell changes identity. Diary summaries, imported workouts, and the rest countdown subscribe independently. Short forms and small horizontal exercise selectors retain ScrollView.
- React Native 0.86 runs the New Architecture. Removed the obsolete `newArchEnabled: false` setting; the existing HealthKit patch is unchanged. See [React Native's architecture change](https://reactnative.dev/blog/2025/10/08/react-native-0.82) and [FlashList recycling guidance](https://shopify.github.io/flash-list/docs/recycling/).

## Deploy the database and backend first

1. Confirm Phase 6 migrations are applied. Review `supabase/migrations/20260908221127_phase7_feedback_account_deletion.sql`, including revocation of direct profile deletion. The existing `users` table remains the profile owner; this migration adds `user_feedback` and a server-managed deletion marker.
2. Use the linked project CLI from a trusted terminal:

   ```sh
   npx supabase migration list --linked
   npx supabase db push --linked --dry-run
   npx supabase db push --linked
   ```

   Review the dry run so it contains only intended pending migrations. Do not run the full bootstrap `schema.sql` over an existing deployment.
3. Configure `SUPABASE_SERVICE_ROLE_KEY` on the Render **web service**, not just the notification worker. Keep it server-only. Preserve per-user LogMeal credential mappings until deletion is verified. Deploy the backend after the migration; the vision route now checks `account_accepts_requests()` before provider work.
4. Verify `/health`. With a disposable account, submit feedback and confirm it is readable only by its owner/service role. Verify another account and anon cannot read or insert it.
5. Test Settings → Delete account on that disposable account, including a dropped response and a retry. Confirm Auth identity, profile, feedback, nutrition, workouts/sets, votes, push registrations, activity snapshots, and private sync receipts disappear. SQL integration tests verify these cascades, but the hosted service and real provider need this acceptance test.

### Deletion behavior and retention

The authenticated `DELETE /api/account` endpoint derives ownership from a verified bearer token and requires typed confirmation. It marks deletion pending, refuses new vision jobs, purges configured LogMeal intake history, revokes sessions, and hard-deletes the Supabase Auth identity. It fails closed on upstream errors and keeps deletion pending for retry. Already confirmed deletion can recover a lost response with a still-valid signature-verified token. Client cleanup removes the owner's durable diary/preferences, stops scheduled work, signs out locally, and clears the query cache.

LogMeal batches are bounded to 50 intakes / 60 seconds; large or interrupted histories may require retries. A 21-second grace period allows admitted vision requests to settle, but a provider can continue processing after an HTTP timeout: verify real provider behavior and confirm zero retained intakes after deletion. Retain an operational process for unresolved pending deletions; this is a retryable request flow, not a durable deletion worker. Remove the deleted user's server credential mapping after provider cleanup. Do not rely on LogMeal's user-delete endpoint alone: [its documented behavior can preserve processed history](https://docs.logmeal.com/reference/delete_v2-users-deleteapiuser-userid). The implementation uses [intake deletion](https://docs.logmeal.com/docs/guides-essential-concepts-intakes-submit-methods).

HealthKit/Health Connect exports remain under the user's control in those applications. An offline second device can retain its existing local cache until it reconnects/signs out; it cannot recreate deleted cloud rows. Publish accurate retention periods for infrastructure backups, request logs, provider records and Sentry events. Do not promise immediate erasure of backups. This project does not currently store user uploads in Supabase Storage; adding Storage requires extending this deletion flow. [Apple requires an accessible account-deletion flow](https://developer.apple.com/support/offering-account-deletion-in-your-app/), and operational retention disclosures must match the actual services.

## One-time EAS setup and native build

1. Fill the existing Sentry/App Store placeholders and publish real HTTPS privacy and support pages. Put `EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_SUPPORT_URL` in `.env.local` and in the matching EAS environments. EAS Update runs locally and cannot read variables with secret visibility: public bundle values and app-config values need plain-text/sensitive visibility. Server credentials must never be `EXPO_PUBLIC_*`. Keep Sentry upload credentials private.
2. Set `APP_VARIANT=preview` in the preview EAS environment and `APP_VARIANT=production` in production. Keep bundle IDs, Expo project ID, native plugin options and all build-time config consistent with each binary. Keep the native build environment and update environment aligned.
3. Inspect remote branches/channels:

   ```sh
   npm run eas -- branch:list
   npm run eas -- channel:list
   ```

   Create these only if absent (EAS branches are separate from Git branches):

   ```sh
   npm run eas -- branch:create preview
   npm run eas -- branch:create main
   npm run eas -- channel:create testing
   npm run eas -- channel:create production
   ```

   Point the channels at the intended EAS branches, then verify:

   ```sh
   npm run eas -- channel:edit testing --branch preview
   npm run eas -- channel:edit production --branch main
   npm run eas -- channel:view testing
   npm run eas -- channel:view production
   ```

4. Review/commit the changes, including the lockfile and patches. Do not include local secrets. Run:

   ```sh
   npm ci
   npm run typecheck
   npm test
   npm run verify:native
   npm run backend:build
   npm run submit:prepare
   npm run launch:check
   npm run eas -- build --platform ios --profile preview
   npm run eas -- build --platform ios --profile production
   npm run eas -- submit --platform ios --profile production --id YOUR_PRODUCTION_BUILD_ID
   ```

   Use the existing Phase 6 signing/App Store Connect checklist in `docs-phase-6.md`. Preview is internal distribution and needs registered iOS devices. Production is the TestFlight/App Store binary. For Android, build the corresponding preview/production profiles with `--platform android`.

A Phase 6 binary without `expo-updates` cannot gain native update support over the air. Fingerprint runtime policy prevents a JS update with incompatible native dependencies/config from reaching an existing binary. New SDKs, native packages, entitlements or native patches require another binary. Settings checks are unavailable in Expo Go/development runtimes. See [Expo 57 Updates](https://docs.expo.dev/versions/v57.0.0/sdk/updates/).

## Publish a compatible JavaScript fix without App Store Connect

Start from a reviewed, committed Git revision. Run tests/typechecks and ensure the native fingerprint matches the installed target binary. These commands publish remotely; they have **not** been executed here.

```sh
npm run typecheck
npm test
APP_VARIANT=preview npm run eas -- update --branch preview --environment preview --platform ios --message "Test feedback and diary fix"
```

On the installed preview binary, open Settings → Check for Updates, wait for download, then Restart to apply update. Confirm the displayed update ID, offline diary reconciliation, feedback, and workout timer. Repeat with Airplane Mode: failed checks must preserve the working bundle. Exit and relaunch to test automatic launch checks as well.

Publish the same reviewed source using **production** configuration, rather than republishing a preview bundle whose native fingerprint or environment differs:

```sh
APP_VARIANT=production npm run eas -- update --branch main --environment production --platform ios --message "Feedback and diary fix"
```

Use `--platform all` only when both iOS and Android target binaries are ready. Inspect the resulting group ID and matching runtime:

```sh
npm run eas -- update:list --branch main
npm run eas -- update:view YOUR_UPDATE_GROUP_ID
```

When Sentry is configured, upload the generated update's source maps immediately after **each** publication using the matching local `dist` output and private `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` environment variables:

```sh
npx sentry-expo-upload-sourcemaps dist
```

Do not upload stale output from another environment. Sentry tags include OTA ID/channel/runtime. See [Expo's Sentry update workflow](https://docs.expo.dev/guides/using-sentry/).

### Recovery

Keep a known-good **production** group ID for each runtime. Republish it to production:

```sh
npm run eas -- update:republish --group KNOWN_GOOD_PRODUCTION_GROUP_ID --destination-channel production --message "Restore known-good production update"
```

If no good OTA exists, use the interactive embedded-bundle rollback workflow and select the affected production runtime:

```sh
npm run eas -- update:roll-back-to-embedded --channel production
```

Do not delete a bad group as a substitute for publishing a rollback. Devices must regain connectivity and check/relaunch to receive the recovery. Keep backend/database changes compatible with older installed bundles and delayed updates. OTA must remain within Apple's reviewed application purpose; native capabilities and material store changes still need review.

## Physical device and App Store checklist

- Install fresh Phase 7 preview and TestFlight binaries. Verify HealthKit patch, notifications, geofencing, background sync, and permissions remain functional.
- Check OTA download/restart, offline failure, restart lock during an active workout/sync, automatic cold-launch application, rollback, embedded update label and actual native build number.
- Scroll a large dining menu and long set list rapidly on the oldest supported iPhone in **Release**, including editing a set then scrolling it out and back. Verify no input appears in another recycled row; profile dropped frames/memory. Automated host-component tests do not establish 60fps.
- Verify safe areas, keyboard reachability, 48-point primary actions, light/dark system appearance, VoiceOver labels/order, Dynamic Type at accessibility sizes, landscape/narrow layout, and readable macro/set columns. Dense workout columns especially need device inspection at large font sizes. New forms retain font scaling; no blanket truncation/shrink override was added.
- Verify feedback offline retry sends one row, daily limits show a friendly message, closing the modal discards its draft, and switching accounts does not reveal a prior draft.
- Verify visible Settings deletion end-to-end using disposable accounts and real provider history. Test timeout/retry and cloud cascades. Do not perform destructive checks on a real diary.
- Confirm privacy/support URLs open publicly and `npm run launch:check` passes. Empty optional account placeholders remain safe locally but are not a public launch configuration.
- Complete App Store metadata: description, screenshots, age rating, support/privacy URLs, review contact and reviewer access, and notes explaining optional location/health/notifications and deletion. Disclose health data uploaded to Supabase, food images sent to LogMeal, restaurant-location requests, diagnostic/feedback data and retention accurately in App Privacy. Review bundled SDK privacy manifests and required-reason API declarations in the final Xcode archive. Do not claim Apple approval from configuration tests.

## Verification performed locally

- `npm test`: 115 passing tests, including Supabase RLS/feedback limits/idempotency/cascades, authenticated deletion failure and lost-ack recovery, provider cleanup, update coalescing/rollback/reload guard, Settings/feedback/deletion mounting, and existing dining/workout interactions.
- `npm run typecheck`: client and backend pass.
- `npm run verify:native`: all three variants pass iOS/Android introspection, including OTA URL/runtime and existing native capabilities.
- EAS 23.2.0 schema validation passes; CLI flags above checked against that version.
- `npm run backend:build`: passes.
- Production `expo export --platform all`: iOS, Android and web bundle successfully.
- `npm run launch:check`: correctly rejects the currently empty public privacy/support placeholders. No launch credentials were fabricated.

These checks do not compile/sign a new native archive, validate hosted migration application, or prove APNs/OTA/provider behavior on physical hardware. Complete the device and deployment checks above before declaring Phase 7 live.
