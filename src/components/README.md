# Shared components

Reusable presentation components and UI primitives live here. `app-tabs.tsx`
and `app-tabs.web.tsx` expose Dining and Workout routes on native and web.
`providers/TrackingProvider.tsx` owns the TanStack Query client, foreground
synchronization, and the single app-level rest ticker so it survives tab changes.

Keep feature-specific screens and business logic in `src/modules`. Forward
`className` to a React Native primitive when creating a styled wrapper.
