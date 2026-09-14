# CalCamp feature modules

See [Phase 3 setup](../../docs-phase-3.md) for provider credentials, authenticated
persistence, native builds, validation, and current limitations.

- `dining/DiningHallScreen.tsx`: four campus hall tabs, TanStack Query menus,
  portion corrections, aggregate diary logging, and explicit cloud load/save.
- `nutrition/tdee.ts`: deterministic 14–30 calendar-day EMA and energy-balance
  estimation. Uses only adherent rows with weight and intake; needs 14 paired
  observations. Calendar gaps affect EMA decay and regression. Returns coverage
  and insufficient/invalid states; does not automatically change intake targets.
- `vision/useFoodVision.ts`: one to four angles of a meal, plus an optional
  description, analysed through the authenticated `/api/vision` proxy or an injected
  analyzer. Validates every returned food, handles cancellation/timeouts, and hands
  back editable rows.
- `vision/resolveItems.ts`: matches each recognised name against the bundled USDA
  database, so the numbers logged are measured rather than guessed wherever a food
  resolves. An unresolved row keeps the model's estimate and reports no
  micronutrients — unknown, not zero.
- `vision/MealReview.tsx`: the rows before they are logged. Re-portion, remove, or
  describe what the photos could not show and re-estimate against the same angles.
- `workout/ActiveWorkoutScreen.tsx`: exercise variations, kg/reps/RPE logging,
  previous-set comparisons, Brzycki estimates, rest countdown, and retryable cloud
  saves. Estimates are omitted outside loaded sets of 1–12 reps. Previous sets
  are currently supplied by props or local history, not fetched from Supabase.
- `health/useHealthSync.ts`: initialization and foreground refresh of today's
  steps/active energy, plus explicit workout and dietary-energy writes. Platform
  adapters isolate HealthKit and Health Connect from unsupported runtimes.
- `routing/StepRouterScreen.tsx`: remaining steps, GPS/College Ave route starts,
  Mapbox walking-loop search, and actual distance/tolerance display. Native
  geometry uses `@rnmapbox/maps`; web shows a route summary and map placeholder.

The root `TrackingProvider` owns Query, account lifecycle, and the single rest
ticker across tab changes. Absolute rest deadlines reconcile on foreground.
Native background ticking needs a custom build and is subject to OS suspension.
Health exports are explicit, and health refresh does not promise background
collection. Active workouts and unsent drafts are not yet durable across restarts.

The app routes are Dining (`/`), Workout (`/explore`), and Walk (`/walk`).
Phase 4 has not been started.
