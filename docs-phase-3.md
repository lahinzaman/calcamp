# Phase 3: persistence and device integrations

## Supabase

The existing `.env.local` contains the supplied public project configuration.
`getSupabase()` in `src/api/supabase.ts` creates the shared client. Native auth
sessions use Expo SecureStore; web uses Supabase's browser storage. The root
lifecycle handles token refresh and clears account-local stores on sign-out or
account changes. No service-role credentials belong in the app.

An authenticated session is required. This phase adds persistence APIs, not a
sign-in screen. The next authentication UI should use this shared client, for
example `getSupabase().auth.signInWithPassword({ email, password })`, rather than
creating a second client. Profile insertion uses the verified Auth user ID and
preserves existing profile fields.

Apply `supabase/schema.sql` to a **fresh** Supabase project before using these
calls. It includes explicit authenticated grants, RLS, generated Brzycki estimates,
and the volume trigger. It is a bootstrap, not an upgrade migration. No hosted
schema was applied or account created during this phase. Live authenticated
writes require an actual user session; local PostgreSQL and mocked HTTP tests
verify the contracts without creating personal test records in the hosted project.

### Diary

- `nutritionStore.getState().loadToday()` loads today's cloud aggregate. Login
  triggers this for an empty local diary. Loading refuses to overwrite local edits.
- `saveToday()` upserts the full daily totals by `(user_id, log_date)`, including
  micros, adherence, and optional `bodyWeightKg`. The Dining tab exposes both actions.
- If a cloud entry already exists and has not been loaded, saving stops instead of
  replacing it with a new local aggregate. Load before logging on another device.
- `setBodyWeightKg()` stores an optional daily measurement for the TDEE history.
  `syncStatus` and `syncError` expose success/failure; saves never fake success.
- Concurrent edits remain local and can be saved again. Separate devices editing
  the same loaded day use last-writer-wins totals; this is not an entry-level merge.

### Workouts

`finishSession()` detaches and queues the completed session. The Workout UI then
calls `savePendingWorkouts()`. Failures retain the snapshot with a retry button;
retrying cannot transfer a snapshot already bound to one account to another.

The repository derives a stable UUID from the account and local session ID,
creates an unfinished workout, upserts completed sets by workout/exercise/set
position, then marks the workout finished. Repeating a successful save returns
the existing ID. Brzycki and volume are computed in PostgreSQL, so attempts to
write those generated/protected columns are avoided. Exercise catalog IDs must
already exist and be accessible to the user; the two starter lifts match the schema.

These are staged HTTP writes, not a transaction spanning the whole workout. A
failed save may leave an unfinished cloud workout; retry completes it. History
queries should filter `finished_at is not null`. Blank draft sets are omitted.
The pending queue and active session remain in memory: app termination loses
unsent drafts. Durable offline queues and conflict resolution are future work.

## Vision proxy

From the repository root:

```bash
cp backend/.env.example backend/.env
# Fill in the backend configuration, then:
npm run backend:dev
```

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `VISION_ALLOWED_ORIGIN` on the
server. For a single development account, set `LOGMEAL_USER_ID` to its Supabase
Auth UUID and `LOGMEAL_API_KEY` to its LogMeal **APIUser** token. For multiple
accounts, provision distinct LogMeal APIUsers and configure the server-only
`LOGMEAL_USER_TOKENS_JSON` mapping. An APICompany token is not interchangeable.
Never share one APIUser token across students' intake histories.

Set `EXPO_PUBLIC_VISION_PROXY_URL` to the full `/api/vision` URL. The hook uses the
current Supabase access token, or an injected `accessToken()` callback. Camera
URIs are read into base64 before upload. Production URLs must use HTTPS. Provider
keys stay in the server's ignored `.env`; public client variables are bundled.

`POST /api/vision` accepts:

```json
{ "image": { "mimeType": "image/jpeg", "base64": "..." } }
```

Include `Authorization: Bearer <Supabase access token>`. The route validates the
session and image, applies IP/account limits and a 20-second provider deadline,
then calls LogMeal segmentation and nutritional information. It returns:

```json
{
  "portion_size_grams": 200,
  "macros": { "caloriesKcal": 300, "proteinG": 20, "carbsG": 30, "fatG": 11 }
}
```

Values describe the entire portion. LogMeal single-photo nutrition may use its
standard serving size; this does **not** implement depth-based portion measurement.
Missing portion/macros or unsupported food segments produce a manual-entry error,
never invented zeros. Provider responses and keys are not logged or returned.
The rate limiter is process-local; multi-instance hosting needs a shared limiter.
No live LogMeal request was made because no provider credentials were supplied.

## HealthKit / Health Connect

`useHealthSync()` exposes `initialize`, `refresh`, `steps`, `activeEnergyKcal`,
`writeWorkout`, and `writeDietaryEnergy`. Initialization is user-triggered from
Walk. The hook refreshes on foreground and once per minute while active. This
phase does not promise continuous background collection.

- iOS reads Steps/ActiveEnergyBurned and requests writes for Workout/EnergyConsumed
  (the library's name for Dietary Energy). HealthKit does not disclose denied
  read access; zero returned data cannot prove permission was granted.
- Android requests Steps/ActiveCaloriesBurned reads and ExerciseSession/Nutrition
  writes. Aggregate queries avoid summing overlapping step records. Denied data
  stays `null`. Samsung Health must be configured to share with Health Connect.
- Health exports are explicit calls, not automatic uploads on every render or
  repeated daily-total writes. Use one stable ID per workout/meal. Android uses
  client record IDs; iOS suppresses duplicate calls only for the current process.
  Cross-restart iOS deduplication and ambiguous-write recovery remain future work.
- Writing errors reject their promises so the calling UI can report them. The
  app does not infer workout calories from lifting volume.

```ts
const health = healthStore.getState();
await health.initialize();
await health.writeWorkout({
  id: savedWorkoutId, name: 'Upper A', start: startedAtISO, end: finishedAtISO,
});
await health.writeDietaryEnergy({
  id: mealId, name: 'Lunch', date: eatenAtISO, caloriesKcal: 500,
});
```

## Walking routes

`StepRouterScreen` is the Walk tab (`/walk`). It uses current health steps or an
explicit manual override, a 10,000-step goal, and an estimated 0.75 m per step.
`stepDeficit()` also accepts a custom stride for future personalization.

Set `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` to a public `pk.` token. The location button
requests foreground GPS; denial or unavailable GPS falls back to Rutgers College
Ave and labels that choice. A separate button starts from College Ave directly.
GPS waits are bounded; stale requests are cancelled when steps change or the
screen unmounts. Location is sent to Mapbox only when generating a requested route.

Directions uses `mapbox/walking`: three closed waypoint candidates and one optional
radius refinement. The closest returned candidate is shown with actual distance,
duration, and signed difference from the target. A tolerance of 10% or 50 m is
used. Walkable paths prevent an exact-distance guarantee or global optimality;
a closed route can retrace segments. No API call is needed once the goal is met
or fewer than 100 m remain. Route geometries render through `@rnmapbox/maps` on
native; web displays the route summary with a native-map placeholder.

## Native setup and validation

Config plugins enable HealthKit entitlements, the four Health Connect permissions,
Mapbox, SecureStore, and foreground location. Android minimum SDK is 26. These
native modules require a development build, not Expo Go:

```bash
npx expo run:ios
npx expo run:android
```

Use a configured native toolchain and real device with Health data. EAS builds can
also supply the app identifiers, signing credentials, and build environment.
No Xcode/Android device build or real device permission flow was available in this
session; successful JavaScript exports are not native binary validation.

```bash
npm run typecheck
npm test
npm run backend:build
npx expo install --check
npx expo config --type introspect
npx expo export --platform all --output-dir dist
```

Tests cover authenticated write payloads using the real Supabase client,
PostgreSQL constraints/RLS and retry semantics, store races/account isolation,
proxy auth/errors/timeouts, health adapter boundaries, and walking-route matching.
The Walk screen was mounted on web and checked with an 8,000-step manual input.
Static web hosting must resolve extensionless routes such as `/walk` to the
exported `/walk.html`; a plain Python file server does not handle that refresh.

The old HealthKit config plugin pulled a vulnerable XML parser. A scoped override
uses the patched version already used by Expo, and config introspection passed.
Remaining npm audit findings are moderate issues in the dependency tree; no
incompatible Expo/RN downgrade was applied to suppress them.

Phase 4 has not been started.

## Provider references

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [Supabase React Native setup](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Supabase upsert](https://supabase.com/docs/reference/javascript/upsert)
- [LogMeal quickstart](https://docs.logmeal.com/docs/guides-getting-started-quickstart)
- [LogMeal nutrition response](https://docs.logmeal.com/reference/post_v2-nutrition-recipe-nutritionalinfo-model-version)
- [React Native Health](https://github.com/agencyenterprise/react-native-health)
- [Health Connect setup](https://matinzd.github.io/react-native-health-connect/docs/get-started/)
- [Mapbox Directions](https://docs.mapbox.com/api/navigation/directions/)
