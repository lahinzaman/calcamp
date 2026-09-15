import { Router } from 'express';
import cors from 'cors';
import { structuredLimit as rateLimit } from './http';
import { verifyBearer } from './supabase-auth';
import { describeProviderFailure, logProviderFailure } from './provider-error';
import { createTokenManager, TokenUnavailable, type TokenManagerOptions } from './fatsecret-token';

const SEARCH_URL = 'https://platform.fatsecret.com/rest/server.api';
const MAX_RESULTS = 20;

/** One branded result. FatSecret publishes all four macros, but against the serving named in
 *  its description — "1 serving" for a brand, "100g" for a generic — so that label travels with
 *  them. Reading these as per-portion when they are per-100g would be a silent threefold error. */
export interface BrandedSuggestion {
  key: string;
  brandName: string;
  itemName: string;
  servingLabel: string;
  macros: { caloriesKcal: number; proteinG: number; carbsG: number; fatG: number };
  foodId: string | null;
}

const text = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/**
 * "Per 1 serving - Calories: 300kcal | Fat: 13.00g | Carbs: 32.00g | Protein: 15.00g".
 * Each figure is found by its own label rather than by position, so a reordered or extended
 * description still reads correctly. A description missing any of the four is unusable — the
 * row is dropped rather than completed with zeros.
 */
export function parseFoodDescription(description: string): { servingLabel: string; macros: BrandedSuggestion['macros'] } | null {
  const serving = /^\s*per\s+(.+?)\s*[-–]\s*/i.exec(description);
  const figure = (label: string) => {
    const match = new RegExp(`${label}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, 'i').exec(description);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) && value >= 0 && value <= 20000 ? value : null;
  };
  const caloriesKcal = figure('calories');
  const proteinG = figure('protein');
  const carbsG = figure('carbs');
  const fatG = figure('fat');
  if (caloriesKcal === null || proteinG === null || carbsG === null || fatG === null) return null;
  return {
    servingLabel: text(serving?.[1], 60) ?? 'serving',
    macros: { caloriesKcal, proteinG, carbsG, fatG },
  };
}

/**
 * FatSecret returns `food` as a bare object when exactly one result matches, and an array
 * otherwise. Treating that object as an array is how a single-hit search silently returns
 * nothing.
 */
export function parseFoodsSearch(value: unknown): BrandedSuggestion[] {
  const foods = (value as { foods?: { food?: unknown } })?.foods?.food;
  if (foods === undefined || foods === null) return [];
  const rows = Array.isArray(foods) ? foods : [foods];
  const suggestions: BrandedSuggestion[] = [];
  const seen = new Set<string>();
  for (const entry of rows.slice(0, MAX_RESULTS)) {
    const row = entry as Record<string, unknown>;
    const itemName = text(row.food_name, 200);
    const brandName = text(row.brand_name, 120);
    // This route answers for restaurants and brands; a generic food is what USDA already covers,
    // and listing it here would duplicate the row above it under a heading it does not belong to.
    if (!itemName || !brandName) continue;
    const description = text(row.food_description, 400);
    const parsed = description ? parseFoodDescription(description) : null;
    if (!parsed) continue;
    const foodId = text(row.food_id, 64);
    const key = `fatsecret:${foodId ?? `${brandName}:${itemName}`.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ key, brandName, itemName, servingLabel: parsed.servingLabel, macros: parsed.macros, foodId });
  }
  return suggestions;
}

export interface BrandedSearchOptions extends TokenManagerOptions {
  authenticate?: (bearer: string) => Promise<string | null>;
  searchFetch?: typeof fetch;
  searchTimeoutMs?: number;
  tokens?: ReturnType<typeof createTokenManager>;
}

export function createBrandedSearchRouter(options: BrandedSearchOptions = {}) {
  const router = Router();
  const authenticate = options.authenticate ?? verifyBearer;
  const tokens = options.tokens ?? createTokenManager(options);
  const fetcher = options.searchFetch ?? options.fetchImpl ?? fetch;
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.searchTimeoutMs ?? 12_000);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnect);
    try {
      const url = `${SEARCH_URL}?${new URLSearchParams({ method: 'foods.search', search_expression: query, format: 'json', max_results: String(MAX_RESULTS) })}`;
      const call = async (token: string) => fetcher(url, { signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      let response = await call(await tokens.token());
      // A token we believed in can still be rejected — revoked, or expired sooner than promised.
      // One forced refresh separates that from a credential that is simply wrong.
      if (response.status === 401) { tokens.invalidate(); response = await call(await tokens.token()); }
      if (!response.ok) {
        // fetch does not throw on 4xx, so the provider's status is attached by hand; without it
        // every upstream refusal would classify as an unrecognised failure.
        const body = await response.json().catch(() => null) as { error?: { message?: unknown; code?: unknown } } | null;
        throw Object.assign(new Error(text(body?.error?.message, 300) ?? `HTTP ${response.status}`),
          { status: response.status, code: body?.error?.code === undefined ? undefined : String(body.error.code) });
      }
      const payload = await response.json() as { error?: { message?: unknown; code?: unknown } };
      // FatSecret answers some failures with HTTP 200 and an error object in the body.
      if (payload?.error) {
        throw Object.assign(new Error(text(payload.error.message, 300) ?? 'FatSecret rejected the search.'),
          { status: 502, code: payload.error.code === undefined ? undefined : String(payload.error.code) });
      }
      res.json({ items: parseFoodsSearch(payload) });
    } catch (cause) {
      const aborted = controller.signal.aborted;
      const failure = cause instanceof TokenUnavailable
        ? { status: 503, code: 'NOT_CONFIGURED', message: 'Branded food search is not configured on this server.' }
        : describeProviderFailure(cause, aborted, { notFoundCode: 'UPSTREAM_NOT_FOUND' });
      logProviderFailure('fatsecret', 'foods.search', cause, failure);
      if (!res.destroyed) res.status(failure.status).json({ error: { code: failure.code, message: failure.message } });
    } finally { clearTimeout(timer); res.off('close', disconnect); }
  });
  return router;
}
