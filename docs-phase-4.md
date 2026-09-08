# Phase 4: authentication, campus services, and EAS

Implemented email/password authentication, protected Expo Router stacks, casual/advanced onboarding, gym status with recent student votes, Google Places macro rescue, and development/preview/production build profiles.

## Database installation

For an existing Phase 1–3 database, run `supabase/migrations/20260908034111_phase4_profiles_and_gym_summary.sql` as the database owner in the Supabase SQL editor. For an empty project, run `supabase/schema.sql` instead. Do not run both: the fresh schema already includes Phase 4. The upgrade file was generated with the Supabase CLI and has been validated locally; it has **not** been applied to the hosted project.

The new profile columns store activity, goals, four training days, training/rest targets, pre-workout carbohydrate allocation, and onboarding completion. JSON targets require all four nonnegative macro values and positive calories. Training days must be distinct. Timing carbohydrates must fit inside the training-day carbohydrate target.

Raw gym votes remain private to their owner. The authenticated `get_gym_busyness()` RPC returns only aggregate counts, scores, and latest timestamps. Its private definer function counts each student's latest vote per venue within 30 minutes. Expired votes do not override forecasts. Do not expose the `private` schema through the Data API.

## Authentication and onboarding

The shared Supabase client supplies a global Zustand session. Expo Router's protected stacks gate the app on both a session and a completed profile. Logout/account changes clear account data and query caches; stale profile responses cannot replace a new account's profile. Database/profile failures keep the protected app closed and show a retry action.

A signup with an immediate session opens onboarding. When email confirmation is enabled, signup opens an onboarding draft; saving requires confirming the email and signing in. Keep Supabase email confirmation enabled as desired. Confirmation links use the project's configured Supabase Site URL; this implementation does not consume OAuth or passwordless callback tokens. It supports explicit email/password sign-in after confirmation.

Advanced onboarding defaults to Monday/Tuesday/Thursday/Friday, with Upper A, Lower A, Upper B, Lower B assigned in Monday-to-Sunday order. This is a saved weekly schedule, not an auto-generated exercise prescription. The Campus screen displays the schedule. Users may enter training/rest macro targets; no age/sex-based calorie prescription is inferred from incomplete onboarding data. Pre-workout carbs are an allocation within the daily budget. Optional targets are applied when the profile loads, on foreground, and at the day rollover.

## Campus backend

Run `npm run backend:dev` from the project directory. The server now loads `backend/.env` before reading `PORT`, so the supplied port 3000 is respected. Configure `EXPO_PUBLIC_BACKEND_URL` with the backend origin; the local value points at the same host as the vision proxy. Physical devices need network access to that host. Production requires a deployed HTTPS Node server; EAS builds do not deploy Express.

Both new routes require a valid Supabase bearer token and enforce IP/account rate limits:

- `GET /api/campus/gyms`: allowlisted Rutgers venues only. BestTime forecasts are cached for 24 hours, coalesced across concurrent callers, and failed lookups are cached for five minutes. This cache is per server process; use a shared cache before scaling to multiple replicas. The score is relative historical busyness, not physical capacity or opening status.
- `POST /api/campus/rescue`: `{ location: { latitude, longitude }, remaining: { caloriesKcal, proteinG, carbsG, fatG }, preference: "protein" | "carbs" }`. Both client and server enforce 22:00–23:59 America/New_York and strictly more than 400 kcal remaining. At midnight the new diary day begins. The user starts the search; location is requested only then.

Backend-only configuration: `GOOGLE_PLACES_API_KEY` with Places API (New) enabled, `BESTTIME_API_KEY` containing the private BestTime key, and the existing Supabase public verification credentials. `CAMPUS_ALLOWED_ORIGIN` accepts comma-separated web origins and defaults to `VISION_ALLOWED_ORIGIN`. Add the deployed web origin for production. Do not put provider private keys into any `EXPO_PUBLIC_*` variable.

Macro rescue sends coordinates to Google, not user identity or nutrition totals. Nearby Search checks at most 20 restaurants within 2.5 km and requires operational status, explicitly open now, at least 4 stars, and at least 20 ratings. The coordinate control switches between live GPS (including a device/emulator located in Millburn) and the Easton Ave preset. No GPS fallback silently changes the selected location.

Google Places does not provide nutrition. `backend/data/rescueCatalog.ts` currently includes three custom Chipotle bowl combinations derived from official US ingredient portions. All calorie/protein/carbohydrate/fat values must fit the remaining budget. Protein results need at least 20 g protein; carb-focused results need at least 30 g carbohydrates. Unknown restaurant nutrition is excluded, so an empty result is expected when the nearby open restaurants have no covered menu items. Expand the sourced catalog with verified local meals/Place IDs before expecting broad Easton Ave coverage. Standard portions do not guarantee actual serving sizes or local item availability. No Yelp integration is used.

## EAS configuration and release preparation

`eas.json` defines:

| Profile | Distribution | Android | iOS | API transport |
| --- | --- | --- | --- | --- |
| development | Internal development client | APK | Registered device | HTTP permitted for local testing |
| preview | Internal release | APK | Registered device | HTTPS |
| production | Store, remote auto-increment | AAB | Store | HTTPS |

`app.config.ts` applies all health, Mapbox, location, SecureStore, and build-properties plugins to every profile. Android minimum SDK is 26. Expo 57 generates iOS deployment target 16.4. HealthKit entitlements and Health Connect permissions/rationale entries are generated. A development build is required; Expo Go cannot load these native modules. The installed Mapbox plugin adds its Maven repository and CocoaPods pre/post install hooks. It uses the installed library's default native SDK version; it does not embed a secret downloads token.

Use `npm run eas -- <command>` for EAS commands in this checkout. Its launcher uses the verified EAS CLI 23.2.0 and sets both `EAS_NO_VCS=1` and an absolute `EAS_PROJECT_ROOT` to this project, because the enclosing Git repository is rooted at the home directory. This prevents a home-directory archive. `.easignore` excludes local env files, native build outputs, and signing material. A local copy made by the current EAS archiver was inspected to verify the project boundary and exclusions.

Before a cloud build:

1. Link this project to the intended Expo account with `npm run eas -- init`. Supply the real `EAS_PROJECT_ID` through each EAS environment or the linked app configuration. The Supabase Auth user UUID is **not** an EAS project ID. The default app identifiers are `com.rulocked.app`, with `.development` / `.preview` suffixes; configure `IOS_BUNDLE_IDENTIFIER`, `ANDROID_PACKAGE`, and optionally `EXPO_OWNER` if your registered identifiers differ.
2. Configure each EAS environment with `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, `EXPO_PUBLIC_BACKEND_URL`, and `EXPO_PUBLIC_VISION_PROXY_URL`. Preview/production need HTTPS backend URLs. The current LAN URLs are for development only. Local env files and server secrets are excluded by `.easignore`.
3. Apply the Phase 4 SQL, configure the backend provider keys and allowed web origins, and deploy the backend. The existing keys are stored locally; live paid-provider calls have not been exercised by automated tests.
4. Run `npm run eas:preflight` with the intended `APP_VARIANT`. A build-worker post-install hook runs the same preflight. It deliberately fails for the current unlinked project and LAN-only production endpoints.
5. Run `npm run eas -- build --profile development --platform all` first and complete Apple/Android signing setup in EAS. Then use preview/production as appropriate. No cloud build, app-store submission, or hosted database write has been performed.

Native project generation and JS exports are verified locally; successful cloud compilation, device permissions, and live provider responses still need real build/device validation.

## Verification

- `npm run typecheck`
- `npm test` — 72 tests, including mounted/authenticated UI interactions, account-switch races, backend auth/gates, strict nutrition matching, RLS, and crowd vote expiry/deduplication.
- `npm run backend:build`
- `npm run verify:native` — introspects all three profiles and checks entitlements, permission declarations, Mapbox configuration, and transport policy.
- `npx expo install --check`
- `npx expo export --platform all`

The current EAS CLI schema accepts all profiles. Expo prebuild generated iOS and Android projects in a temporary directory with Mapbox integration and health configuration. Browser review verified the sign-in/signup layout and a signed-out app redirect; authenticated onboarding and campus interactions are covered by injected-service UI tests without creating real accounts or contacting paid providers.

## Provider references

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) and [protected authentication routes](https://docs.expo.dev/router/advanced/authentication/)
- [EAS build profiles](https://docs.expo.dev/build/eas-json/)
- [Supabase signup/session behavior](https://supabase.com/docs/reference/javascript/auth-signup)
- [Rutgers recreation facilities](https://recreation.rutgers.edu/facilities)
- [BestTime API](https://documentation.besttime.app/)
- [Google Places Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search)
- [Chipotle US nutrition source](https://www.chipotle.com/content/dam/chipotle/menu/nutrition/US-Nutrition-Facts-Paper-Menu-3-2025.pdf)
