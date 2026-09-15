import { createAccountRouter } from './account';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createVisionProxyRouter } from './vision-proxy';
import { createRecipeProxyRouter } from './recipe-proxy';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { apiErrors, requestTelemetry, structuredLimit } from './http';
import { createCachedLoader } from './cache';
import { createCampusProxyRouter } from './campus-proxy';

import { createNutrisliceFallbackRouter } from './nutrislice-fallback';

export function createApp(options: { pingDatabase?: () => Promise<boolean> } = {}) {
  config({ path: resolve(process.cwd(), 'backend/.env'), quiet: true });
  const app = express();
  app.disable('x-powered-by');
  // Render terminates TLS at a reverse proxy and puts the caller's address in X-Forwarded-For.
  // With no trust setting Express reports the proxy's own address instead, express-rate-limit
  // refuses to key a limit on it — ERR_ERL_UNEXPECTED_X_FORWARDED_FOR — and the rejection takes
  // the process down with it. Must be set before any limiter runs.
  //
  // 1 trusts exactly one hop, so the address comes from the last entry, which the proxy writes
  // itself. Never `true`: that reads the first entry, which is whatever the caller sent, and a
  // per-IP limit keyed on a value the caller chooses is not a limit at all. TRUST_PROXY still
  // overrides with an exact subnet list, a different hop count, or `false` where there is no proxy.
  const trusted = process.env.TRUST_PROXY?.trim();
  app.set('trust proxy',
    !trusted ? 1
      : /^\d+$/.test(trusted) ? Number(trusted)
        : /^(false|off|none)$/i.test(trusted) ? false
          : trusted.split(',').map(entry => entry.trim()).filter(Boolean));
  app.use(requestTelemetry);
  const cached = createCachedLoader();
  const ping = options.pingDatabase ?? (async () => {
    const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return false;
    const client = createClient(url, key, { auth: { persistSession: false }, global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(3000) }),
    } });
    const { data, error } = await client.rpc('service_health'); return !error && data === true;
  });
  app.get(['/', '/health'], structuredLimit({ limit: 60 }), async (_req, res) => {
    let database = false;
    try { database = (await cached('health', async () => {
      // Bound injected and actual probes, coalescing requests during a cold start.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { return await Promise.race([ping(), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 3500); })]); }
      finally { clearTimeout(timer); }
    }, 10_000, 0)).value; } catch { /* Degraded status contains no internal diagnostics. */ }
    res.set('Cache-Control', 'no-store').status(database ? 200 : 503).json({ service: 'rulocked', status: database ? 'ok' : 'degraded', uptimeSeconds: Math.floor(process.uptime()), database: database ? 'ok' : 'unavailable' });
  });
  app.use('/api/account', createAccountRouter());
  app.use('/api/campus', createCampusProxyRouter());
  app.use('/api/vision', createVisionProxyRouter());
  app.use('/api/recipe', createRecipeProxyRouter());
  app.use('/api/nutrislice', createNutrisliceFallbackRouter());
  app.use((_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }); });
  app.use(apiErrors);
  return app;
}

// Importing the app in tests never binds a port.
if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 through 65535.');
  }
  app.listen(port, () => {
    console.log(`CalCamp API listening on port ${port}`);
  });
}
