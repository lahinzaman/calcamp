# Phase 4 configuration inputs

- Use Google Places exclusively for takeout recommendations. Yelp is no longer part of the plan.
- The public Mapbox token is configured in `.env.local`.
- LogMeal, Google Places, and the BestTime private API key are configured only in `backend/.env`.
- Both local environment files are ignored by Git. Example files contain placeholders only.
- The supplied development account UUID is configured as `LOGMEAL_USER_ID`. Multiple app accounts require distinct LogMeal APIUser tokens.
- The supplied LAN vision endpoint is configured in `EXPO_PUBLIC_VISION_PROXY_URL`, and the backend port is set to 3000. This HTTP endpoint is for development builds; production requires HTTPS. Set the server CORS allowlist to the actual web origin when deploying.

Credentials have been saved locally; live provider calls and Phase 4 implementation have not been started.
