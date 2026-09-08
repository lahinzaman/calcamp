# API layer

Typed API clients and response adapters live here. Feature UI belongs in
`src/modules`; TanStack Query integration will be added with the feature UI.

Future server integrations will use the Node.js/Express backend and Supabase.
Private provider credentials belong on the server, never in the mobile bundle.
`nutrislice.ts` fetches a single campus day across all three meals. It validates
upstream data, preserves unknown macro values as `null`, and supports an explicit
Express fallback origin. The shared response types live in `src/types/nutrislice.ts`.

The companion endpoint is documented in `backend/README.md`. Neither this client
nor the menu proxy writes nutrition logs. The Dining UI logs locally;
`trackingRepository.ts` performs authenticated diary/workout persistence.
`supabase.ts` owns the shared client and session storage.

Live Rutgers observations (2026-09-08): the four halls advertise `lunch-test` as
their lunch slug, while `/menu-type/lunch/` returns 404. Foods expose
`rounded_nutrition_info`; `nutrition_info` is supported when present and takes
precedence for reported values. These fields are modelled honestly as optional,
not assumed to exist on every food. Portion metadata and unknown values are
preserved. Nutrient keys remain in the upstream units; convert explicitly before
writing them to the database's canonical nutrient map.

Source: [Rutgers menu metadata](https://rutgers.api.nutrislice.com/menu/api/schools/?format=json).
The upstream slug mapping is isolated in `nutrislice.ts` for future changes.
