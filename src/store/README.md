# Client state

`nutritionStore.ts` and `workoutStore.ts` expose typed selector hooks, singleton
vanilla stores, and isolated `createNutritionStore` / `createWorkoutStore`
factories with injectable clocks for tests. Actions validate numeric inputs and
copy caller-owned values. Treat returned state as immutable.

```tsx
const consumed = useNutritionStore((state) => state.consumedMacros);
const addConsumed = useNutritionStore((state) => state.addConsumed);
const restTimer = useWorkoutStore((state) => state.restTimer);
```

Nutrition tracks device-local calendar dates. Call `syncToday()` on foreground
and before reading/logging totals; it clears consumption and adherence when the
day changes while retaining targets and the selected dining hall. Consumption and
adherence actions also roll over atomically, preventing yesterday's totals from
carrying into a midnight entry. Targets start as `null` until onboarding supplies
them. Micronutrient keys and canonical units
live in `src/types/nutrition.ts` and mirror the SQL nutrient registry. Missing
micronutrients mean unreported; present amounts are known subtotals and do not
imply that every meal supplied that nutrient. Use `setConsumed` for corrections
or server hydration and `addConsumed` for additional tracked food.

Workout exercise instance IDs are separate from catalog IDs, allowing repeated
exercises in a session. Sequence and per-exercise set array order map to the
database's one-based positions. Weight is kilograms. Draft sets permit missing
weight/reps; completing a set requires both and starts its configured rest timer.
Timers store an absolute end timestamp. `TrackingProvider` owns the single
app-level ticker and calls `clearExpiredRestTimer()` on foreground. Screens read
`useRestCountdown()`; the store owns no interval or background task.
`finishSession()` returns a detached snapshot, queues it for persistence, then
clears the active session and timer; draft sets retain null completion.

Call both stores' `reset()` actions on logout; the root auth lifecycle does this
when an account signs out or changes. The workout UI and SQL schema both use
Brzycki for supported loaded sets of 1–12 reps. TanStack Query owns campus menu
caching. The nutrition module exposes TDEE without automatically changing targets.

## Cloud sync

`loadToday()` / `saveToday()` synchronize diary aggregates. `finishSession()` also
queues an immutable workout; `savePendingWorkouts()` retries it. The UI exposes
save/error state and uses authenticated Supabase calls. The active session and
unsent queue remain in memory. See [Phase 3 setup](../../docs-phase-3.md) for account
isolation, conflict behavior, and staged workout writes. MMKV hydration, durable
offline queues, and rest notifications remain future work.
