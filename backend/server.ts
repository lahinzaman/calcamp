import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createVisionProxyRouter } from './vision-proxy';
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
  // Set to the exact trusted reverse-proxy subnet in deployment, never unrestricted true.
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY.split(','));
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
  app.use('/api/campus', createCampusProxyRouter());
  app.use('/api/vision', createVisionProxyRouter());
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
    console.log(`RULocked API listening on port ${port}`);
  });
}
