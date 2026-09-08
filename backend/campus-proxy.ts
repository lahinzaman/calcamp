import { Router, json, type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { createBestTimeService } from './besttime';
import { findRescueMeals } from './places';
import { rescueEligible, type Coordinates, type MacroPreference } from '../src/types/rescue';
import type { MacroTotals } from '../src/types/nutrition';
export function validateRescueRequest(body: unknown): { location: Coordinates; remaining: MacroTotals; preference: MacroPreference } {
  const data = body as { location?: Coordinates; remaining?: MacroTotals; preference?: MacroPreference };
  if (!data?.location || !Number.isFinite(data.location.latitude) || !Number.isFinite(data.location.longitude)
    || data.location.latitude < -90 || data.location.latitude > 90 || data.location.longitude < -180 || data.location.longitude > 180) throw new Error('Valid GPS coordinates are required.');
  if (!data.remaining || !(['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const).every(k => Number.isFinite(data.remaining![k]) && data.remaining![k] >= 0 && data.remaining![k] <= 20000)
    || !['protein', 'carbs'].includes(data.preference!)) throw new Error('Valid remaining macros and preference are required.');
  return { location: { latitude: data.location.latitude, longitude: data.location.longitude }, remaining: data.remaining, preference: data.preference! };
}
export function createCampusProxyRouter(options: {
  authenticate?: (token: string) => Promise<string | null>; baselines?: ReturnType<typeof createBestTimeService>;
  rescue?: typeof findRescueMeals; now?: () => Date;
} = {}) {
  const router = Router(); const baselines = options.baselines ?? createBestTimeService();
  const authenticate = options.authenticate ?? (async token => {
    const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return null;
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
    } });
    const { data, error } = await client.auth.getUser(token); return error ? null : data.user?.id ?? null;
  });
  router.use(cors({ origin: (process.env.CAMPUS_ALLOWED_ORIGIN ?? process.env.VISION_ALLOWED_ORIGIN)?.split(',') ?? false,
    methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] }));
  router.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.use(async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) { res.status(401).json({ error: 'Sign in to use campus services.' }); return; }
    try { const id = await authenticate(token); if (!id) { res.status(401).json({ error: 'Session expired. Sign in again.' }); return; } res.locals.userId = id; next(); }
    catch { res.status(503).json({ error: 'Authentication unavailable.' }); }
  });
  router.use(rateLimit({ windowMs: 60_000, limit: 12, keyGenerator: (_req, res) => res.locals.userId as string, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.get('/gyms', async (_req, res) => { res.json(await baselines()); });
  router.post('/rescue', json({ limit: '4kb' }), async (req, res) => {
    let input: ReturnType<typeof validateRescueRequest>;
    try { input = validateRescueRequest(req.body); } catch { res.status(400).json({ error: 'Provide valid coordinates, macros, and a protein or carbs preference.' }); return; }
    const now = options.now?.() ?? new Date();
    if (!rescueEligible(input.remaining, now)) { res.status(409).json({ error: 'Macro rescue opens at 10 PM Eastern when more than 400 kcal remain.' }); return; }
    try { res.json(await (options.rescue ?? findRescueMeals)(input.location, input.remaining, input.preference, { now })); }
    catch { res.status(503).json({ error: 'Restaurant search unavailable. Try again later.' }); }
  });
  const errorHandler: ErrorRequestHandler = (_error, _req, res, _next) => { res.status(400).json({ error: 'Invalid request.' }); };
  router.use(errorHandler);
  return router;
}
