# Nutrislice fallback

Install dependencies from the repository root with `npm ci`.

```bash
npm run backend:dev
```

The server defaults to port 3001; set `PORT` to override it. For compiled Node.js:

```bash
npm run backend:build
npm run backend:start
```

`GET /api/nutrislice/daily-menu?diningHall=busch-dining-hall&date=2026-09-08`
returns the same unified array as the mobile fetcher. It supports all four
allowlisted dining halls and fetches breakfast, lunch, and dinner concurrently.

Client opt-in:

```ts
fetchDailyMenu('busch-dining-hall', '2026-09-08', {
  fallbackBaseUrl: process.env.EXPO_PUBLIC_NUTRISLICE_PROXY_URL || undefined,
});
```

Set that variable to the proxy origin, for example `https://menus.example.edu`.
Use a device-reachable address for local phone testing; `localhost` on a phone
refers to the phone itself. The proxy URL is public configuration, not a secret.

This router sends public CORS headers, validates its query, forwards cancellation,
and never accepts an arbitrary upstream URL. It returns 400 for invalid input,
502 for upstream failures, 504 for timeouts, and 500 for unexpected server errors.
Successful responses may be cached for 60 seconds; upstream failures are not cached.

The fallback handles browser CORS restrictions and provides an alternative
network path on native devices. A Rutgers outage or incompatible upstream schema
still produces an error; it does not fabricate a successful empty menu. The
shared parser in `src/api/nutrislice.ts` is the single place to adapt payload changes.

The backend is compiled separately from Expo. Importing this router into an
existing Express app does not start a server; mount it at `/api/nutrislice`.

## Food vision

The server also mounts authenticated `POST /api/vision` and loads `backend/.env`.
Copy `backend/.env.example` and configure a LogMeal APIUser token for each app
account. See [Phase 3 setup](../docs-phase-3.md) for the JSON contract, Supabase
authentication, CORS, provider limitations, and frontend configuration.
