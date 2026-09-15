import { Router } from 'express';
import cors from 'cors';
import { structuredLimit as rateLimit } from './http';
import { verifyBearer } from './supabase-auth';
import { describeProviderFailure, logProviderFailure } from './provider-error';

const INSTANT = 'https://trackapi.nutritionix.com/v2/search/instant';
/** Enough to fill a suggestion list; more only spends quota on rows nobody scrolls to. */
const MAX_RESULTS = 20;

/**
 * One branded suggestion. Instant search publishes calories and nothing else — no protein,
 * carbohydrate or fat — so `macros` stays null and `needsNutrients` says so, rather than the
 * row arriving as a food that contains none of them. The nix_item_id is what a later call to
 * /v2/search/item needs to fill them in.
 */
export interface BrandedSuggestion {
  key: string;
  brandName: string;
  itemName: string;
  servingQty: number | null;
  servingUnit: string | null;
  servingWeightGrams: number | null;
  caloriesKcal: number | null;
  macros: { proteinG: number; carbsG: number; fatG: number } | null;
  needsNutrients: boolean;
  nixItemId: string | null;
  photoUrl: string | null;
}

const text = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
const amount = (value: unknown, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;

export function parseInstantBranded(value: unknown): BrandedSuggestion[] {
  const branded = (value as { branded?: unknown })?.branded;
  if (!Array.isArray(branded)) return [];
  const suggestions: BrandedSuggestion[] = [];
  const seen = new Set<string>();
  for (const entry of branded.slice(0, MAX_RESULTS)) {
    const row = entry as Record<string, unknown>;
    const brandName = text(row.brand_name, 120);
    const itemName = text(row.food_name, 200);
    // A suggestion that cannot name its brand and its item is not a suggestion.
    if (!brandName || !itemName) continue;
    const nixItemId = text(row.nix_item_id, 64);
    const key = `nutritionix:${nixItemId ?? `${brandName}:${itemName}`.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const photo = row.photo as { thumb?: unknown } | null | undefined;
    suggestions.push({
      key, brandName, itemName,
      servingQty: amount(row.serving_qty, 1000),
      servingUnit: text(row.serving_unit, 40),
      servingWeightGrams: amount(row.serving_weight_grams, 5000),
      caloriesKcal: amount(row.nf_calories, 20000),
      // Instant search does not carry them; nothing here may invent them.
      macros: null,
      needsNutrients: true,
      nixItemId,
      photoUrl: text(photo?.thumb, 400),
    });
  }
  return suggestions;
}

export interface BrandedSearchOptions {
  authenticate?: (bearer: string) => Promise<string | null>;
  credentials?: () => { appId?: string; apiKey?: string };
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createBrandedSearchRouter(options: BrandedSearchOptions = {}) {
  const router = Router();
  const fetcher = options.fetchImpl ?? fetch;
  const authenticate = options.authenticate ?? verifyBearer;
  const credentials = options.credentials
    ?? (() => ({ appId: process.env.NUTRITIONIX_APP_ID, apiKey: process.env.NUTRITIONIX_API_KEY }));
  router.use(cors({ origin: process.env.VISION_ALLOWED_ORIGIN?.split(',') ?? false,
    methods: ['GET'], allowedHeaders: ['Content-Type', 'Authorization'] }));
  router.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.get('/', async (req, res, next) => {
    // Every route here that spends someone else's quota is behind a session, so this one is too.
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    if (!match) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in to search branded foods.' } }); return; }
    try {
      const userId = await authenticate(match[1]);
      if (!userId) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Your session is invalid or expired.' } }); return; }
      res.locals.userId = userId; next();
    } catch { res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' } }); }
  }, rateLimit({ windowMs: 60_000, limit: 20, keyGenerator: (_req, res) => res.locals.userId as string,
    standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const raw = req.query.query;
    const query = typeof raw === 'string' ? raw.trim() : '';
    if (!query || query.length > 200) {
      res.status(400).json({ error: { code: 'INVALID_QUERY', message: 'Send a search term of 1 to 200 characters.' } }); return;
    }
    const { appId, apiKey } = credentials();
    if (!appId || !apiKey) {
      res.status(503).json({ error: { code: 'NOT_CONFIGURED', message: 'Branded food search is not configured on this server.' } }); return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnect);
    try {
      const url = `${INSTANT}?${new URLSearchParams({ query, branded: 'true', common: 'false' })}`;
      const response = await fetcher(url, { signal: controller.signal,
        headers: { 'x-app-id': appId, 'x-app-key': apiKey, Accept: 'application/json' } });
      if (!response.ok) {
        // fetch does not throw on 4xx, so the provider's own status is attached by hand —
        // without it every upstream refusal would classify as an unrecognised failure.
        const body = await response.json().catch(() => null) as { message?: unknown; id?: unknown } | null;
        throw Object.assign(new Error(text(body?.message, 300) ?? `HTTP ${response.status}`),
          { status: response.status, code: text(body?.id, 64) ?? undefined });
      }
      res.json({ items: parseInstantBranded(await response.json()) });
    } catch (cause) {
      const failure = describeProviderFailure(cause, controller.signal.aborted, { notFoundCode: 'UPSTREAM_NOT_FOUND' });
      logProviderFailure('nutritionix', 'search/instant', cause, failure);
      if (!res.destroyed) res.status(failure.status).json({ error: { code: failure.code, message: failure.message } });
    } finally { clearTimeout(timer); res.off('close', disconnect); }
  });
  return router;
}
