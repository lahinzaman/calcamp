import { logMealTokenForUser } from './logmeal-account';
import { Router, json, type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { structuredLimit as rateLimit } from './http';
import { createClient } from '@supabase/supabase-js';

export interface VisionResult {
  portion_size_grams: number;
  macros: { caloriesKcal: number; proteinG: number; carbsG: number; fatG: number };
}
type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid provider object.');
  return value as ObjectValue;
}
export function normalizeLogMeal(value: unknown): VisionResult {
  const data = object(value);
  if (data.hasNutritionalInfo !== true || (Array.isArray(data.ids) && data.ids.includes(null))) throw new Error('Incomplete food recognition.');
  const portion = data.serving_size;
  if (typeof portion !== 'number' || !Number.isFinite(portion) || portion <= 0) throw new Error('Provider did not report a portion.');
  const nutrients = object(object(data.nutritional_info).totalNutrients);
  const read = (key: string, unit: string) => {
    const nutrient = object(nutrients[key]);
    if (nutrient.unit !== unit || typeof nutrient.quantity !== 'number' || !Number.isFinite(nutrient.quantity) || nutrient.quantity < 0) throw new Error('Incomplete nutrient totals.');
    return nutrient.quantity;
  };
  return { portion_size_grams: portion, macros: { caloriesKcal: read('ENERC_KCAL', 'kcal'),
    proteinG: read('PROCNT', 'g'), carbsG: read('CHOCDF', 'g'), fatG: read('FAT', 'g') } };
}
export function decodeImage(value: unknown) {
  const image = object(object(value).image);
  const { base64, mimeType } = image;
  if (typeof base64 !== 'string' || base64.length > 8_000_000 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Invalid base64 image.');
  const bytes = Buffer.from(base64, 'base64');
  const valid = (mimeType === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    || (mimeType === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    || (mimeType === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
  if (!valid || !bytes.length || bytes.length > 6_000_000) throw new Error('Use a JPEG, PNG, or WebP image under 6 MB.');
  return { bytes, mimeType: mimeType as string };
}
export interface VisionProxyOptions {
  authenticate?: (bearer: string) => Promise<string | null>;
  tokenForUser?: (userId: string) => string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}
export function createVisionProxyRouter(options: VisionProxyOptions = {}) {
  const router = Router();
  const fetcher = options.fetchImpl ?? fetch;
  const authenticate = options.authenticate ?? (async (bearer: string) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return null;
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) } });
    const { data, error } = await client.auth.getUser(bearer);
    if (error || !data.user) return null;
    const scoped = createClient(url, key, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${bearer}` }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } });
    const active = await scoped.rpc('account_accepts_requests');
    return !active.error && active.data === true ? data.user.id : null;
  });
  const tokenForUser = options.tokenForUser ?? logMealTokenForUser;
  router.use(cors({ origin: process.env.VISION_ALLOWED_ORIGIN?.split(',') ?? false,
    methods: ['POST'], allowedHeaders: ['Content-Type', 'Authorization'] }));
  router.use(rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.post('/', async (req, res, next) => {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    if (!match) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in to recognize food.' } }); return; }
    try {
      const userId = await authenticate(match[1]);
      if (!userId) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Your session is invalid or expired.' } }); return; }
      res.locals.userId = userId; next();
    } catch { res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' } }); }
  }, rateLimit({ windowMs: 60_000, limit: 6, keyGenerator: (_req, res) => res.locals.userId as string,
    standardHeaders: 'draft-8', legacyHeaders: false }), json({ limit: '8mb' }), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let image: ReturnType<typeof decodeImage>;
    try { image = decodeImage(req.body); }
    catch { res.status(400).json({ error: { code: 'INVALID_IMAGE', message: 'Send a base64 JPEG, PNG, or WebP image under 6 MB.' } }); return; }
    let token: string | undefined;
    try { token = tokenForUser(res.locals.userId as string); } catch { /* Invalid server config stays private. */ }
    if (!token) { res.status(503).json({ error: { code: 'NOT_CONFIGURED', message: 'Food recognition is not configured for this account.' } }); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnect);
    try {
      const form = new FormData();
      form.append('image', new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }), 'meal');
      const request = async (path: string, body: FormData | string) => {
        const response = await fetcher(`https://api.logmeal.com/v2/${path}`, { method: 'POST', body,
          headers: { Authorization: `Bearer ${token}`, ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}) }, signal: controller.signal });
        if (!response.ok) throw new Error('Provider unavailable.');
        return object(await response.json());
      };
      const recognized = await request('image/segmentation/complete', form);
      if (!Number.isInteger(recognized.imageId) || Number(recognized.imageId) <= 0) throw new Error('No recognized image.');
      const nutrition = await request('nutrition/recipe/nutritionalInfo', JSON.stringify({ imageId: recognized.imageId }));
      res.json(normalizeLogMeal(nutrition));
    } catch {
      if (!res.destroyed) res.status(controller.signal.aborted ? 504 : 502).json({ error: {
        code: controller.signal.aborted ? 'TIMEOUT' : 'RECOGNITION_FAILED', message: 'No complete estimate is available. Enter this meal manually.',
      } });
    } finally { clearTimeout(timer); res.off('close', disconnect); }
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error?.type === 'entity.too.large' ? 413 : 400).json({ error: { code: 'INVALID_BODY', message: 'Invalid or oversized JSON image body.' } });
  };
  router.use(errors);
  return router;
}
