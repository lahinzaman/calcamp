# Phase 5: resiliency and release verification

Implemented locally on September 8, 2026. Phase 4's existing physical-iOS verification remains the baseline; the Phase 5 native additions have not yet been tested on hardware. No hosted database migration, Render deployment, EAS build, commit, or push was performed in this phase.

## What changed

| Area | Implementation | Behavior |
| --- | --- | --- |
| Health routes | `backend/server.ts`, `backend/http.ts` | `GET /` and `/health` return service status, uptime, and a database RPC probe; healthy is HTTP 200, degraded is 503. Probes coalesce and cache for 10 seconds, with a 3.5-second deadline. Request IDs, JSON request telemetry, structured rate limits, and sanitized errors replace Express fallbacks. |
| Campus caching | `backend/cache.ts`, `backend/campus-proxy.ts`, `backend/nutrislice-fallback.ts`, `src/api/campus.ts` | Menus and individual gym forecasts have a configurable five-minute fresh TTL, stale fallback, concurrent-request coalescing, and a 30-second upstream-failure cooldown. A partial gym outage preserves that gym's prior estimate. Client gym cache survives restarts. |
| Dining fallback | `src/api/nutrislice.ts`, `DiningHallScreen.tsx` | If neither Rutgers nor the cached menu is available, the proxy includes the existing sourced rescue catalog. The screen labels it as published takeout alternatives with unverified hours/availability; it is never presented as a Rutgers menu or an empty successful scrape. |
| Durable tracking | `src/modules/sync/`, `nutritionStore.ts`, `workoutStore.ts`, `trackingRepository.ts` | SQLite on native and localStorage on web atomically persist each account's diary, workout draft, and mutation outbox. Each food-log action queues its macro/micronutrient delta. Completed workouts retain immutable snapshots and stable server IDs. |
| Retry and reconciliation | `engine.ts`, `runtime.ts`, migration | Reconnection and foreground activity drain up to 30 jobs per batch. Transient failures use exponential backoff with jitter, capped at five minutes. A daily edit cannot overtake an earlier failed edit for that day; unrelated days/workouts can proceed. Permanent failures require review. Discarding a failed nutrition edit first reloads the cloud record and atomically reapplies the remaining queued edits. |
| Health sync | `healthAdapter.ios.ts`, `useHealthSync.ts`, `healthBatch.ts`, `background.native.ts` | Steps and active-energy statistics replace prior readings. iOS imports the most recent seven days of workouts, deduplicates UUIDs, and excludes this app's exports. Imports appear separately from manual lifting volume and never add dietary calories. Workouts that disappear from the queried window disappear from that imported snapshot. |
| Health exports | Native patch, durable export receipts | Completed RULocked sessions export after the user connects Health. Explicit nutrition exports also enter the outbox. Stable HealthKit sync identifiers/version metadata and Health Connect client record IDs allow retry after a lost acknowledgement. Denied write permission blocks the export for review rather than creating a sample. |
| UX | Sync indicator, diary conflict review, screen boundaries, loading cards, permission sheet | Synced/syncing/offline/queued/review states are visible. Failed device writes leave the last saved state intact and show a friendly error. Root route transitions fade; protected screens remain closed if durable storage cannot initialize. |

Food persistence remains compatible with the existing aggregate diary schema: individual food additions are queued as deltas, without adding a separate food-history table. Manual body-weight/adherence edits resolve by server arrival order. Macro and micronutrient additions from independent devices accumulate; negative totals fail validation and require review.

## Database rollout

For the existing Phase 4 project, apply **only** `supabase/migrations/20260908055510_phase5_idempotent_nutrition_sync.sql` through the project's normal migration workflow. `supabase/schema.sql` includes the migration for empty databases and must not be replayed over an existing installation.

The migration adds:

- `service_health()`: an anonymous, read-only database probe returning a boolean, without exposing application records.
- `private.nutrition_mutation_receipts`: account-scoped, RLS-protected mutation IDs and payload receipts.
- `apply_nutrition_mutation(...)`: an authenticated, invoker-security RPC that locks the day, validates deltas, applies totals and inserts the receipt in one transaction. Repeating an ID/payload is a no-op; reusing an ID for a different payload fails.

Keep the `private` schema outside the Data API's exposed schemas. Retain receipts for the account lifetime: deleting them would allow an old offline retry to add calories again. Hosted rollout is still pending; local PostgreSQL tests verified the function, constraints, grants, receipt privacy, retries, independent edits and transaction rollback.

Release order:

1. Apply the migration to the existing Supabase project and verify `service_health()` through its public RPC endpoint.
2. Deploy the updated backend to Render. Check both `https://rulocked.onrender.com/` and `/health` for `status: "ok"`, `database: "ok"`, an integer `uptimeSeconds`, and `X-Request-ID`. Configure Render's health-check path as `/health` after the migration is present.
3. Rebuild the native app with EAS. SQLite, NetInfo, TaskManager, BackgroundTask, and the expanded HealthKit patch require a new binary; a JavaScript-only update is insufficient. If using a locally generated native project, regenerate its Expo configuration and install its pods before building.
4. Complete the hardware checklist below before promoting the Phase 5 binary.

No additional third-party API key is required for this implementation. Existing Supabase, LogMeal, Google Places, BestTime, and Mapbox configuration is reused. Preserve the existing per-account LogMeal token mapping.

## Configuration and operating limits

- `CAMPUS_CACHE_TTL_SECONDS=300` is the default; accepted range is 1–3600. Stale menu/forecast retention is one additional hour after the fresh TTL. The client gym cache retains responses for at most one hour from receipt.
- `ResponseCache` is an asynchronous GET/SET interface suitable for a Redis adapter. This release uses a bounded **in-memory** backend cache; Redis has not been installed or provisioned. A Redis adapter must serialize cache entries and expire them at `staleUntil`. Request coalescing and failure cooldowns are process-local.
- Existing IP and authenticated-account rate limits remain in force; the new root/health limit is 60 requests/minute/IP. Rate-limit stores are process-local. Multi-instance deployments need a shared limiter store and shared response cache to enforce service-wide quotas.
- Set `TRUST_PROXY` to the deployment's explicitly verified proxy subnet(s), comma-separated. Do not set unrestricted trust or assume client-supplied forwarded headers are trustworthy. Verify distinct test clients have distinct limiter IPs behind Render before increasing traffic.
- Request telemetry records request ID, method, route, status and duration, without request bodies or authorization headers. Do not add food images or health payloads to logs.
- BackgroundTask requests a minimum interval of 15 minutes. iOS chooses actual execution time based on device conditions; this is scheduled batch synchronization, not continuous HealthKit observer delivery. Foreground reads, reconnection, and explicit sync remain available. Force-quitting the app can prevent background execution until it is reopened.
- Native auth tokens use SecureStore's `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` accessibility for background sessions. After reboot, unlock once before expecting authenticated background work. HealthKit itself can still refuse reads while locked; pending writes remain queued.
- Web storage is local to a browser profile. Closing/reopening preserves edits; clearing site data or uninstalling the native app removes local-only edits. Logout keeps each account's queue isolated for that same account's next login.
- iOS intentionally conceals read-permission denial, sometimes returning zero visible data. The UI explains this instead of claiming zero proves permission was granted. Automatic background work never opens a permission prompt.

## Automated verification

Run from the repository root:

```sh
npm test
npm run typecheck
npm run backend:build
npm run verify:native
npm run eas:preflight
npx patch-package --error-on-fail
npx expo export --platform all --output-dir /private/tmp/rulocked-phase5-export
```

Verified locally: **94 tests passed, 0 failed**; frontend/backend TypeScript checks and backend compilation passed; development, preview and production native configuration introspection passed; the production EAS configuration preflight passed; the HealthKit patch applied successfully; and Expo exported iOS, Android and web bundles with 15 static web routes. `git diff --check` passed. Native compilation and physical Phase 5 acceptance remain pending.

The suite includes route validation and sanitized 429/400/503 responses, database probe coalescing, cache TTL/cooldown/stale behavior, partial gym outages, deterministic dining fallback, account isolation, lost acknowledgements, in-flight edits, exponential retry, explicit conflict discard, native export metadata, permission denial, health snapshot replacement, real SQLite transaction failure, stale cloud-response rejection, sync-state rendering and the Walk permission-sheet mount. React tests mount the tracking/auth/onboarding/campus components with native host components mocked. Expo exports validate JavaScript bundling and static routes; configuration introspection is not a substitute for native compilation or device testing.

The Phase 4 `RCTCallableJSModules setBridge:` fix is preserved. `patch-package` now runs after dependency installation, and the same patch also passes sync metadata through native workout and dietary saves. `.gitattributes` exempts generated patch context whitespace from whitespace linting so valid patch context remains intact.

## Physical iOS acceptance checklist

Record the app build number, iOS version, device model, test account, and result for each check. Use a test account and fixture backend for fault injection.

- [ ] **Install:** Install a newly rebuilt Phase 5 development/preview binary. Confirm startup, sign-in, onboarding and all four tabs render without native bridge/module errors. Check accessibility text size, VoiceOver button labels and portrait keyboard layouts.
- [ ] **Online diary:** Log a known portion, then refresh. Compare calories/macros/micros in the UI and Supabase; verify one receipt per log action and no increase on repeated Sync now.
- [ ] **Airplane mode:** After one successful login/profile load, go offline. Log two foods, change adherence/weight, edit an active set, finish a workout and start another draft. Confirm the queued indicator and usable inputs.
- [ ] **Process death:** Force-close and reopen while still offline. Confirm totals, pending completed workout, active draft, set values and rest deadline survive. Existing authenticated account routes must open from cached profile data.
- [ ] **Reconnect:** Restore network. Confirm the queue drains automatically, generated Brzycki estimates/volume match the completed sets, and indicators settle. Compare final totals with the sum of the original edits.
- [ ] **Lost acknowledgement:** On a test proxy, allow a nutrition RPC or workout write to commit, then drop its response. Reopen/retry; verify one receipt, one completed workout/set sequence and unchanged totals.
- [ ] **Two devices:** Add different food amounts on two signed-in devices, including an offline device. Reconnect both and refresh; verify the additions accumulate. Confirm explicit field edits follow documented arrival order.
- [ ] **Conflict review:** Produce a validly authenticated but rejected mutation in a test backend. Confirm later edits for that day wait, other work can sync, and Review shows the blocked edit. A failed refresh during discard must retain that edit. After reconnecting, retry or discard deliberately and verify remaining edits are preserved.
- [ ] **Account isolation:** Queue edits as account A, sign out, then sign in as B. Verify A's diary, imports and queued counts do not appear or write into B. Sign back into A and confirm its queue resumes. Do not clear app storage between these steps.
- [ ] **Storage failure:** Inject a SQLite write error in a development build. Verify an attempted edit is not acknowledged as saved, prior data remains available, and the UI gives a readable recovery message. Restore storage and retry the edit.
- [ ] **Permissions:** Open the Health explanation sheet; cancel first, then connect. Decline permissions and confirm the app remains usable, with manual step entry available. Grant access in Health settings and refresh. Revoke write access and verify exports require review rather than silently disappearing.
- [ ] **Metric reconciliation:** Read steps/active energy repeatedly while walking. Confirm readings replace prior totals instead of accumulating each refresh. Enter manual steps; confirm routing uses the override without increasing diary calories or HealthKit totals.
- [ ] **Workout imports:** Add a separate workout in Apple Health/another app, refresh, and see it once in the imported list. Confirm manual lifting volume is unchanged. Delete it from Health and refresh; verify it disappears. RULocked exports must not reappear as imports.
- [ ] **Export retry:** Complete a RULocked workout while connected, then simulate interruption/relaunch around its native save. Confirm exactly one corresponding HealthKit workout. Repeat an explicit dietary-energy export with the same ID and check that its energy sample is not duplicated. Native metadata behavior must be confirmed on hardware.
- [ ] **Background:** After unlocking once, leave the app in the background with network available. Use Expo's development-only BackgroundTask testing API when needed, then also observe OS-scheduled runs. Verify last-health-sync timestamps and outbox progress. Test locked-device read failure and successful refresh after unlock; no background permission prompts should appear.
- [ ] **Expiration:** Expire/intercept a background task in a development build. Verify unsent jobs remain on disk and foreground reopening rechecks connectivity and resumes draining.
- [ ] **Campus outages:** Warm the fixture menu/gym cache, then time out Rutgers/BestTime. Verify stale labels, including a single unavailable gym alongside live gyms. With no usable menu cache, confirm sourced alternatives appear with unverified availability. No failure should appear as an empty successful menu or a fabricated zero-busyness reading.
- [ ] **Backend limits:** Against a fixture/test deployment, verify malformed images/coordinates are rejected before providers run, repeated requests receive structured 429 plus Retry-After, and provider timeouts show manual/retry guidance without raw stack traces.
- [ ] **Rollover/navigation:** Cross local midnight, switch tabs during loading, background during rest, reconnect on another network, and return. Verify day totals reset appropriately, queued prior-day edits retain their original date, and rest countdown uses the elapsed wall-clock deadline.

Keep the hosted migration and native rebuild as release gates. The source changes alone do not establish that the currently deployed Render service or installed Phase 4 binary contains Phase 5.
