> Phase 4 is implemented. See [Phase 4 setup and deployment](docs-phase-4.md) for the required database upgrade, auth flow, campus endpoints, and EAS environment/signing steps. The hosted database and cloud builds have not been changed.

# RULocked

Fitness, nutrition, and campus tools for Rutgers University–New Brunswick.

## Current scope: Phase 3

The foundation uses Expo SDK 57, React Native 0.86, Expo Router, strict TypeScript,
NativeWind 4, and Tailwind CSS 3. The Dining, Workout, and Walk tabs expose the primary
tracking screens with a shared TanStack Query provider.

Phase 1 adds the Supabase schema, typed Zustand nutrition/workout stores, the
Rutgers Nutrislice client, and an Express fallback proxy. Phase 2 adds adherent-day
EMA/TDEE estimation, campus menu logging with editable portions, a typed food
vision adapter hook, and workout logging with Brzycki 1RM and rest countdowns.
Phase 3 wires authenticated Supabase writes, a secured food-vision proxy, HealthKit /
Health Connect adapters, and Mapbox walking-loop generation. See [Phase 3 setup](docs-phase-3.md)
for credentials, authentication prerequisites, persistence semantics, and device
build requirements. Authentication UI, durable offline queues, MMKV persistence,
and further modules remain for later phases.

The schema file is an initial schema for a fresh Supabase project. It has not
been applied to a hosted database. Inspect `supabase/schema.sql` before applying
it through a Supabase migration or SQL editor.
After authentication, the app must insert its own `public.users` profile using
the authenticated user ID before creating related logs; automatic signup profile
creation is not part of this phase.

## Local development

Use Node.js 22.13 or newer, as required by Expo SDK 57.

```bash
npm ci
npm run typecheck
npm test
npm start -- --clear
```

`npm run ios`, `npm run android`, and `npm run web` launch the existing Expo
development workflow. Native rest ticking uses `react-native-background-timer`
and requires a custom native/development build. Expo Go and web use a foreground
interval. Native JavaScript exports alone do not install this native module.

## Source layout

```text
src/
  api/          # Nutrislice fetcher and validated response normalization
  app/          # Expo Router routes and root layout
  components/   # Tabs, shared components, Query/rest-countdown provider
  constants/    # Existing theme constants
  hooks/        # Existing shared presentation hooks
  modules/      # Dining, nutrition algorithms, vision hook, workout UI
  store/        # Typed stores with explicit cloud sync and retry state
  types/        # Shared contracts and environment declarations
  global.css    # Tailwind directives and existing web font variables
backend/        # Express menu/vision proxies and separate Node TypeScript build
supabase/       # Initial PostgreSQL schema and isolated database tests
```

The `@/*` TypeScript alias resolves to `src/*`; `@/assets/*` resolves to `assets/*`.

## NativeWind configuration

- `tailwind.config.js` scans all source components, loads the NativeWind preset,
  and defines the `scarlet` color token.
- `babel.config.js` uses `babel-preset-expo` with the NativeWind JSX import source
  and the `nativewind/babel` preset. Expo handles React Compiler and Worklets.
- `metro.config.js` wraps Expo's default Metro configuration with `withNativeWind`.
- `src/app/_layout.tsx` imports the global stylesheet once at the route root.
- `nativewind-env.d.ts` enables React Native `className` types;
  `src/types/environment.d.ts` loads Expo's CSS and Metro declarations.

Use complete, statically discoverable utility strings such as
`className="flex-1 items-center bg-scarlet"`. After changing Babel or Metro
configuration, restart with `npm start -- --clear`.

## Verification

```bash
npm run typecheck
npm test
npm run backend:build
npx expo install --check
npx expo export --platform all --output-dir dist
```

Exports check the JavaScript and styling pipeline for iOS, Android, and web; they
do not replace native builds or device testing. Tests cover the stores, menu
parsing/failures, HTTP proxy, TDEE/1RM edge cases, vision lifecycle, mounted screens,
and schema constraints/RLS in an isolated PGlite
PostgreSQL instance with a minimal test-only Supabase auth shim. These database
tests do not replace checking the schema in your actual Supabase project.
Component tests use mocked native host views with real React, stores, and Query.
ESLint remains an unconfigured starter script.

## Campus menu engine

`fetchDailyMenu(diningHall, date)` returns breakfast, lunch, and dinner together
for one calendar date. Pass a `YYYY-MM-DD` string for an unambiguous campus day.
Missing nutrition values stay `null`; known zero values stay zero. Errors are
reported instead of silently returning an incomplete day.

See `backend/README.md` to start the fallback server and configure the optional
`fallbackBaseUrl`. The dining screen reads `EXPO_PUBLIC_NUTRISLICE_PROXY_URL`
as that fallback origin. See `src/store/README.md` for store actions and timer usage,
and `src/modules/README.md` for module contracts and limitations.

The database nutrient registry and TypeScript `NUTRIENT_UNITS` use the same
unit-labelled keys. Omitted micronutrients mean unreported; they are not assumed
to be zero. Users' logs, workouts, sets, and votes are protected by row-level
security; the exercise catalog also supports private custom mechanical variants.

## Setup references

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [NativeWind 4 installation](https://www.nativewind.dev/docs/getting-started/installation)
- [Expo SDK 57 Reanimated setup](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/)
