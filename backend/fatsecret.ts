import { Router, type RequestHandler } from 'express';
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

/** One way a food is sold, with the macros FatSecret already scaled to it. */
export interface FoodServing {
  servingId: string;
  description: string;
  metricAmount: number | null;
  metricUnit: string | null;
  isDefault: boolean;
  macros: BrandedSuggestion['macros'];
}
export interface BarcodeFood {
  foodId: string;
  brandName: string | null;
  itemName: string;
  servings: FoodServing[];
  /** The serving a caller gets if it does not choose one. */
  defaultServingId: string;
}

const figure = (value: unknown, max: number) => {
  // Number('') is 0, so an empty field would read as a food containing none of that macro
  // rather than one whose panel did not report it. An empty string is absence, not zero.
  const amount = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(amount) && amount >= 0 && amount <= max ? amount : null;
};

/**
 * FatSecret returns every serving a food is sold in, each already carrying its own macros. The
 * bug this replaces read the first serving's numbers and presented them as whatever portion the
 * user picked — so choosing "1 cup" logged the figures for "100 g". Each serving keeps its own,
 * and the caller scales by choosing a serving rather than by arithmetic on the wrong one.
 */
export function parseFoodServings(value: unknown): BarcodeFood | null {
  const food = (value as { food?: Record<string, unknown> })?.food;
  if (!food) return null;
  const itemName = text(food.food_name, 200);
  const foodId = text(food.food_id, 64);
  if (!itemName || !foodId) return null;
  const raw = (food.servings as { serving?: unknown } | undefined)?.serving;
  // A single serving comes back as a bare object, exactly as `food` does in a one-hit search.
  const rows = raw === undefined || raw === null ? [] : Array.isArray(raw) ? raw : [raw];
  const servings: FoodServing[] = [];
  for (const entry of rows) {
    const row = entry as Record<string, unknown>;
    const servingId = text(row.serving_id, 64);
    const description = text(row.serving_description, 120);
    const caloriesKcal = figure(row.calories, 20000);
    const proteinG = figure(row.protein, 2000);
    const carbsG = figure(row.carbohydrate, 2000);
    const fatG = figure(row.fat, 2000);
    // A serving missing any macro cannot be logged against; it is dropped, not zero-filled.
    if (!servingId || !description || caloriesKcal === null || proteinG === null || carbsG === null || fatG === null) continue;
    servings.push({ servingId, description,
      metricAmount: figure(row.metric_serving_amount, 100000), metricUnit: text(row.metric_serving_unit, 20),
      isDefault: String(row.is_default ?? '') === '1',
      macros: { caloriesKcal, proteinG, carbsG, fatG } });
  }
  if (!servings.length) return null;
  return { foodId, brandName: text(food.brand_name, 120), itemName, servings,
    defaultServingId: (servings.find(serving => serving.isDefault) ?? servings[0]).servingId };
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
  // Every route here spends someone else's quota, so every one of them is behind a session.
  const requireSession: RequestHandler = async (req, res, next) => {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    if (!match) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in to search branded foods.' } }); return; }
    try {
      const userId = await authenticate(match[1]);
      if (!userId) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Your session is invalid or expired.' } }); return; }
      res.locals.userId = userId; next();
    } catch { res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' } }); }
  };
  router.get('/', requireSession, rateLimit({ windowMs: 60_000, limit: 20, keyGenerator: (_req, res) => res.locals.userId as string,
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

  /**
   * A scanned package. The caller sends thirteen digits because the scanner reported something
   * else — a twelve-digit UPC-A, or an eight-digit UPC-E — and normalising that is the client's
   * job before it ever gets here. Anything else is refused rather than looked up, because a
   * lookup for the wrong digits answers for the wrong product.
   */
  router.get('/barcode', requireSession, rateLimit({ windowMs: 60_000, limit: 20,
    keyGenerator: (_req, res) => res.locals.userId as string, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const gtin = typeof req.query.gtin === 'string' ? req.query.gtin.trim() : '';
    if (!/^\d{13}$/.test(gtin)) {
      res.status(400).json({ error: { code: 'INVALID_BARCODE', message: 'Send a 13-digit GTIN.' } }); return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.searchTimeoutMs ?? 12_000);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnect);
    try {
      const call = async (params: Record<string, string>) => {
        const url = `${SEARCH_URL}?${new URLSearchParams({ format: 'json', ...params })}`;
        const send = async (token: string) => fetcher(url, { signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
        let response = await send(await tokens.token());
        if (response.status === 401) { tokens.invalidate(); response = await send(await tokens.token()); }
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: { message?: unknown; code?: unknown } } | null;
          throw Object.assign(new Error(text(body?.error?.message, 300) ?? `HTTP ${response.status}`),
            { status: response.status, code: body?.error?.code === undefined ? undefined : String(body.error.code) });
        }
        const payload = await response.json() as { error?: { message?: unknown; code?: unknown } };
        if (payload?.error) {
          throw Object.assign(new Error(text(payload.error.message, 300) ?? 'FatSecret rejected the request.'),
            { status: 502, code: payload.error.code === undefined ? undefined : String(payload.error.code) });
        }
        return payload;
      };
      const found = await call({ method: 'food.find_id_for_barcode', barcode: gtin }) as { food_id?: { value?: unknown } };
      const foodId = text(found.food_id?.value, 64);
      // FatSecret answers an unknown barcode with food_id 0, not an error. A shelf full of real
      // products is not in any database; saying so is the difference between a dead end and a
      // form the person can fill in themselves.
      if (!foodId || foodId === '0') {
        res.status(404).json({ error: { code: 'BARCODE_UNKNOWN', message: 'That barcode is not in the food database. Enter the package values by hand.' } });
        return;
      }
      const food = parseFoodServings(await call({ method: 'food.get.v2', food_id: foodId }));
      if (!food) {
        res.status(404).json({ error: { code: 'BARCODE_UNKNOWN', message: 'That product has no usable nutrition panel. Enter the package values by hand.' } });
        return;
      }
      res.json(food);
    } catch (cause) {
      const failure = cause instanceof TokenUnavailable
        ? { status: 503, code: 'NOT_CONFIGURED', message: 'Barcode lookup is not configured on this server.' }
        : describeProviderFailure(cause, controller.signal.aborted, { notFoundCode: 'UPSTREAM_NOT_FOUND' });
      logProviderFailure('fatsecret', 'food.find_id_for_barcode', cause, failure);
      if (!res.destroyed) res.status(failure.status).json({ error: { code: failure.code, message: failure.message } });
    } finally { clearTimeout(timer); res.off('close', disconnect); }
  });
  return router;
}
