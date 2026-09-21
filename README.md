# CalCamp

An iOS app for people who lift and track what they eat. Nutrition logging, hypertrophy
programming and weight-trend analysis in one place, built around a campus dining database so a
university meal can be logged as precisely as a packaged food.

Built with Expo SDK 57 and React Native 0.86 on the New Architecture, with Supabase for data and
a small Express service for anything that needs an API key. Shipped to TestFlight through EAS.

---

## What it does

**Nutrition.** Barcode scanning that resolves through FatSecret's GTIN-13 lookup, food search
across USDA and Open Food Facts, on-device nutrition-label OCR, photo estimation, and campus
dining menus pulled live from Rutgers Nutrislice. Anything the camera reads can come from a
photo taken earlier instead. Macros are normalised per serving, and an unreported value stays
unreported rather than becoming a zero.

**Training.** A 232-exercise catalogue, user-created exercises, routine templates with supersets,
and a live session logger with rest timers, plate maths, Brzycki 1RM estimates and personal
records. Sets can be weight × reps, bodyweight reps, a duration or a distance, because a plank
is not three reps of anything.

**Analysis.** Weight trend smoothing that separates real change from water and food, TDEE
estimated from adherent days, weekly volume per muscle with direct and assisting work counted
separately, and progress photos stored only on the device. A treadmill console can be
photographed and read, adding the steps a phone left on the rail never counted.

**Platform.** Apple Health read/write, Live Activities on the Lock Screen and Dynamic Island,
campus geofencing, offline-first sync, and 13 languages including right-to-left layouts.

---

## What is interesting about the code

This is the part worth reading if you are evaluating the engineering rather than the feature
list. Each of these is a decision with a reason, and the reason is in the source.

### Offline-first sync with a durable outbox

Every write goes to a SQLite-backed queue before it goes anywhere near the network
(`src/modules/sync/engine.ts`). The queue distinguishes transient failures, which back off
exponentially, from permanent ones — a constraint violation, a permissions error — which are
*blocked* and surfaced to the user rather than retried forever. Nutrition mutations for a given
day are ordered so a failed edit cannot be overtaken by a later one, and the snapshot plus its
acknowledgement commit in a single SQLite write so a crash cannot replay a delta.

### The database is the last line of defence, not the first

`supabase/schema.sql` carries row-level security on every table, generated columns for values
the client must never author (Brzycki 1RM, session volume), and triggers that reject data the
app should not have produced. A completed set is validated against its exercise's tracking type,
so the database will refuse to record a plank as five reps
(`validate_set_measurements`). 17 migrations, each mirrored into the bootstrap schema, with
tests asserting that a migrated database and a fresh one agree.

### Reading a machine you cannot trust

The treadmill scanner (`src/modules/quickActions/treadmill.ts`) is a small study in refusing to
guess. A figure has to be captioned to be taken. `CAL/HR` is a rate and is never banked as a
total. Seven-segment OCR confusions are corrected inside a number and never in a caption. The
gap between a caption and its figure crosses one newline and only whitespace, because letting it
cross anything means an empty field silently adopts the next field's number. Steps the console
displayed are used as measured; steps derived from distance and a height-based stride are
labelled an estimate all the way into the database, where a constraint stops a device
measurement ever claiming to be one.

### Measurement honesty

A recurring theme, and the source of several fixed bugs. An unreported micronutrient is `null`,
not `0`. Body mass is not external load, so an unweighted pull-up contributes nothing to pounds
moved. A warm-up is logged but never counted as hard volume, while a drop set is. Barcodes are
validated against their own check digit before a lookup, and two frames must agree before a scan
is accepted, because a single frame decodes wrongly often enough to matter.

### Native constraints drive the design

The HealthKit integration uses `@kingstinct/react-native-healthkit` on Nitro rather than a
legacy bridge module, because the old bridge is gone in React Native 0.86. iOS shows its
permission sheet exactly once, so the app checks `getRequestStatusForAuthorization` before
mounting a prompt that might silently do nothing. Every native call is bounded by a timeout —
a permission sheet that never presents otherwise leaves a promise pending forever, which reads
to a user as a spinner that never stops.

### Tests that encode the bug they prevent

446 tests across 82 files. They are not coverage theatre: most were written in response to a
specific defect and are named after the behaviour rather than the function. The Supabase schema
is tested against a real PostgreSQL instance in-process via PGlite, including RLS enforcement
from the perspective of two different signed-in users.

---

## Architecture

```text
src/
  api/          Supabase repositories, external food APIs, typed HTTP clients
  app/          Expo Router routes (file-based) and the root layout
  components/   Shared UI, charts, providers
  modules/      Feature modules — the bulk of the code
    workout/      Catalogue, routines, supersets, volume, session archive
    quickActions/ Camera, barcode, GTIN normalisation, label OCR
    sync/         Durable queue, engine, runtime bridge
    health/       HealthKit and Health Connect adapters behind one interface
    nutrition/    TDEE, adaptive targets, micronutrients
    insights/     Trends, analytics, charts
  store/        Zustand stores with explicit sync state
  theme/        Design tokens, motion, haptics
  types/        Shared contracts
backend/        Express proxy — hides FatSecret and OpenAI keys from the client
supabase/       Schema, migrations, and isolated PostgreSQL tests
```

**Native code is never written by hand.** `ios/` and `android/` are gitignored; everything
native is expressed as Expo config plugins in `app.json` and generated by EAS through Continuous
Native Generation. This keeps the build reproducible and the repository free of generated Xcode
state.

**The backend exists only for secrets.** Anything the client could call directly, it does.
`backend/` proxies the six endpoints that need a server-held key or a server-side rate limit:
`/api/account`, `/api/campus`, `/api/nutrislice`, `/api/recipe`, `/api/search-branded`,
`/api/vision`.

---

## Running it

Requires Node.js 22.13+ (Expo SDK 57) and, for anything touching HealthKit, Live Activities or
barcode scanning, a physical device — those do not exist in the simulator.

```bash
npm ci
npm run typecheck        # app and backend, both strict
npm test                 # 446 tests, no watch mode, no network
npm start -- --clear
```

Verification used before every release:

```bash
npm run verify:native    # config plugins, permissions, OTA fingerprint, channels
npx expo export --platform ios
```

Database changes are applied with `npx supabase db push`. Migrations must land before the app
build that depends on them, or the client writes columns the server does not have.

---

## Deployment

| Piece    | Where it runs | How it ships |
|----------|---------------|--------------|
| iOS app  | TestFlight    | `eas build --platform ios --profile production` |
| JS-only changes | Existing binary | `eas update` — the runtime version uses a fingerprint policy, so an update only reaches a build whose native surface matches |
| Backend  | Render        | Push to `main` |
| Database | Supabase      | `npx supabase db push` |

---

## Known limitations

Stated plainly, because a README that claims everything works is not worth reading.

- **Supersets are session and template only.** They are not uploaded to Supabase, so a pairing
  is not visible from another device's history.
- **Progress photos never leave the device.** This is deliberate — they are the most personal
  data the app holds — but it does mean a reinstall loses them.
- **Activity backup is opt-in and off by default.** Steps do not appear in Trends until it is
  enabled, which is a consent decision rather than an oversight.
- **Treadmill steps are added on top of device steps.** If you carried a phone or watch on the
  treadmill, those steps were already counted and reading the console will overstate the day.
  The app says so before saving; it cannot detect it.
- **Tap-to-focus refocuses, it does not focus on the point you touched.** expo-camera exposes
  the focus mode and never `focusPointOfInterest`, so a tap runs a fresh autofocus pass and
  locks it. Real point-focus needs a patched native module.
- **Treadmill steps never reach Apple Health.** An OCR reading of a console is an estimate, and
  Health is a record of what devices measured.
- **Android is built and typechecked but not actively tested.** Health Connect has an adapter
  behind the same interface as HealthKit; it has had far less real use.
- **ESLint is not configured.** Type checking and tests carry the weight.

---

## Reference

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) — the versioned docs this project pins to
- `supabase/schema.sql` — the full data model, with the reasoning in comments
- `AGENTS.md` — conventions for anyone, human or otherwise, working in this repository
