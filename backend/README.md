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
Copy `backend/.env.example` and set one `OPENAI_API_KEY`. It serves every signed-in
user: nothing is provisioned per account, and no per-user token mapping is kept.

The route takes one to four base64 photographs of the same meal plus an optional
free-text `note`, and answers with the foods it recognised:

```json
{ "images": [{ "base64": "…", "mimeType": "image/jpeg" }], "note": "half the rice was left" }
{ "items": [{ "name": "White rice, cooked", "grams": 200, "confidence": 0.7,
              "macros": { "caloriesKcal": 260, "proteinG": 5, "carbsG": 56, "fatG": 1 } }],
  "note": "The sauce under the rice could not be identified." }
```

Macros describe the whole portion. They are the model's own estimate: the client
replaces them with USDA figures wherever the name resolves to a bundled food, and
labels the row as estimated where it does not. A response with no usable row is a
failed recognition (502), never a meal of zero calories.

## Recipe import

`POST /api/recipe` takes `{ "url": "https://…" }` and answers with the recipe that page
describes:

```json
{ "title": "Sunday Chili", "servings": 6,
  "ingredients": [{ "name": "beef, ground, cooked", "grams": 907,
                    "macros": { "caloriesKcal": 2168, "proteinG": 236, "carbsG": 0, "fatG": 127 } }],
  "note": null }
```

Gram weights are for the **whole recipe**, not per serving. Macros are the model's own
estimate: the client replaces them with USDA figures wherever the name resolves to a bundled
food, and labels the row an estimate where it does not — the same resolution the photo and
description flows use, and the reason it happens client-side (the 3.3 MB USDA bundle ships
with the app, not the server).

The page is fetched **server-side**, so the address is treated as hostile: http(s) only, DNS
resolved and every answer checked against the private, loopback, link-local and carrier ranges,
redirects followed by hand with each hop re-checked, three hops maximum, 2 MB and 15 seconds.
It reuses `OPENAI_API_KEY`; no extra configuration.

## Branded fast food search

`GET /api/search-branded?query=chipotle` searches FatSecret, behind the same session check and
rate limits as every other route that spends a third-party quota.

```json
{ "items": [{ "key": "fatsecret:1", "brandName": "Chipotle", "itemName": "Chicken Burrito Bowl",
              "servingLabel": "1 serving",
              "macros": { "caloriesKcal": 625, "proteinG": 45, "carbsG": 63, "fatG": 21.5 },
              "foodId": "1" }] }
```

Macros are parsed out of FatSecret's `food_description` — `"Per 1 serving - Calories: 300kcal |
Fat: 13.00g | Carbs: 32.00g | Protein: 15.00g"` — by label rather than by position, so a
reordered or extended description still reads correctly. They belong to `servingLabel`, which is
`100g` for anything measured that way: reading those as per-portion is a silent threefold error.
A description missing any of the four is unusable and the row is dropped.

Only branded rows are returned. A generic food is what the bundled USDA data already covers, and
listing it here would repeat it under a heading it does not belong to.

The OAuth token is fetched once and held in memory until a minute before it expires; concurrent
searches share a single refresh. A token FatSecret rejects triggers exactly one forced refresh
and retry, which separates a revoked token from a credential that is simply wrong.

Needs `FATSECRET_CLIENT_ID` and `FATSECRET_CLIENT_SECRET`. Without them the route answers 503
`NOT_CONFIGURED` rather than failing at the call.
