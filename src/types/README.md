# Shared types

Shared TypeScript contracts belong here. `nutrition.ts` defines macros and the
unit-labelled nutrient registry; `workout.ts` defines active-session state;
`campus.ts` and `nutrislice.ts` define dining locations and upstream/menu contracts.
Keep feature-only types within their module. Supabase-generated client types can
be added once the schema is applied to a development project.

`environment.d.ts` loads Expo's CSS and Metro declarations so type checking works
on a fresh install, before Expo generates its ignored environment file.
