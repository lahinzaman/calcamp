import { Router, json, type ErrorRequestHandler } from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { structuredLimit as rateLimit } from './http';
import { describeProviderFailure, logProviderFailure } from './provider-error';
import { verifyBearer } from './supabase-auth';

/** One recognised food. Macros are the model's own estimate for `grams`, replaced client-side
 *  by USDA figures wherever the name resolves to a bundled food. */
export interface VisionItem {
  name: string;
  grams: number;
  confidence: number;
  macros: { caloriesKcal: number; proteinG: number; carbsG: number; fatG: number };
}
export interface VisionResult {
  items: VisionItem[];
  /** What the model could not settle from the photos — shown to the user, never silently dropped. */
  note: string | null;
}

const MAX_IMAGES = 4;
const MAX_ITEMS = 12;
/** Balanced default; set OPENAI_VISION_MODEL to trade cost against accuracy without a deploy. */
const DEFAULT_MODEL = 'gpt-5.6-terra';

const PROMPT = `You are estimating the food in one meal, from photographs, from a description in the person's own words, or from both.

Any photos are different angles of the SAME meal — do not count a dish twice because it appears in more than one photo. When there are no photos, work only from the description: take the portions it states, and use an ordinary serving of that food where it does not state one.

For each distinct food or drink, report:
- name: the plainest generic name for the food — what a nutrition database would call it, not what a menu would. Prefer "oats, cooked" over "oatmeal", "carbonated beverage, cola" over "coke". No brand names unless the packaging is legible, and no adjective that is not about the food itself.
- grams: the edible weight of THIS portion. Use the plate, cutlery, hands and containers for scale. Report what is actually present, not a standard serving.
- confidence: 0 to 1, for the identification and the portion together. Be honest — a sauce you cannot see the bottom of is low confidence.
- macros: calories, protein, carbs and fat for that many grams.

Split composite plates into their components. Include cooking fats and dressings you have evidence of. Do not invent an item that neither the photos nor the description support.

If anything is genuinely unclear, say so in "note" — a single short sentence naming what you could not settle, such as a portion the description left open. Use null when what you were given was enough.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'note'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'grams', 'confidence', 'macros'],
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          confidence: { type: 'number' },
          macros: {
            type: 'object',
            additionalProperties: false,
            required: ['caloriesKcal', 'proteinG', 'carbsG', 'fatG'],
            properties: {
              caloriesKcal: { type: 'number' }, proteinG: { type: 'number' },
              carbsG: { type: 'number' }, fatG: { type: 'number' },
            },
          },
        },
      },
    },
    note: { type: ['string', 'null'] },
  },
} as const;

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid provider object.');
  return value as ObjectValue;
}
const amount = (value: unknown, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;

/**
 * A model that returns nothing usable is a failed recognition, not an empty meal — the caller
 * must be able to tell those apart, so this throws rather than returning zero items.
 */
export function normalizeVision(value: unknown): VisionResult {
  const data = object(value);
  if (!Array.isArray(data.items)) throw new Error('Provider returned no item list.');
  const items: VisionItem[] = [];
  for (const entry of data.items.slice(0, MAX_ITEMS)) {
    const item = object(entry);
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 150) : '';
    const grams = amount(item.grams, 5000);
    const macros = object(item.macros);
    const totals = {
      caloriesKcal: amount(macros.caloriesKcal, 20000), proteinG: amount(macros.proteinG, 2000),
      carbsG: amount(macros.carbsG, 2000), fatG: amount(macros.fatG, 2000),
    };
    // A partial row is dropped rather than completed with zeros: an unreported macro is unknown.
    if (!name || !grams || Object.values(totals).some(value => value === null)) continue;
    const confidence = amount(item.confidence, 1);
    items.push({ name, grams, confidence: confidence ?? 0, macros: totals as VisionItem['macros'] });
  }
  if (!items.length) throw new Error('No food was recognised.');
  const note = typeof data.note === 'string' && data.note.trim() ? data.note.trim().slice(0, 300) : null;
  return { items, note };
}

export interface DecodedImage { bytes: Buffer; mimeType: string; base64: string }
function decodeOne(value: unknown): DecodedImage {
  const image = object(value);
  const { base64, mimeType } = image;
  if (typeof base64 !== 'string' || base64.length > 8_000_000 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Invalid base64 image.');
  const bytes = Buffer.from(base64, 'base64');
  const valid = (mimeType === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    || (mimeType === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    || (mimeType === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
  if (!valid || !bytes.length || bytes.length > 6_000_000) throw new Error('Use a JPEG, PNG, or WebP image under 6 MB.');
  return { bytes, mimeType: mimeType as string, base64 };
}
/** Accepts the multi-angle body and the single-image body older builds still send. */
export function decodeRequest(value: unknown): { images: DecodedImage[]; note: string | null } {
  const body = object(value);
  const list = Array.isArray(body.images) ? body.images : body.image !== undefined ? [body.image] : [];
  if (list.length > MAX_IMAGES) throw new Error(`Send at most ${MAX_IMAGES} images.`);
  const images = list.map(decodeOne);
  const raw = body.note;
  if (raw !== undefined && raw !== null && typeof raw !== 'string') throw new Error('Invalid note.');
  const note = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 500) : null;
  if (!images.length && !note) throw new Error('Send at least one image or a description.');
  return { images, note };
}

export interface VisionProxyOptions {
  authenticate?: (bearer: string) => Promise<string | null>;
  apiKey?: () => string | undefined;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}
export function createVisionProxyRouter(options: VisionProxyOptions = {}) {
  const router = Router();
  const authenticate = options.authenticate ?? verifyBearer;
  // One server-side key serves every signed-in user; nothing is provisioned per account.
  const apiKey = options.apiKey ?? (() => process.env.OPENAI_API_KEY);
  const model = options.model ?? (process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL);
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
    standardHeaders: 'draft-8', legacyHeaders: false }), json({ limit: '32mb' }), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let request: ReturnType<typeof decodeRequest>;
    try { request = decodeRequest(req.body); }
    catch { res.status(400).json({ error: { code: 'INVALID_IMAGE', message: `Send a description, or up to ${MAX_IMAGES} base64 JPEG, PNG, or WebP images under 6 MB each.` } }); return; }
    let key: string | undefined;
    try { key = apiKey(); } catch { /* Invalid server config stays private. */ }
    if (!key) { res.status(503).json({ error: { code: 'NOT_CONFIGURED', message: 'Food recognition is not configured on this server.' } }); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnect);
    try {
      const client = new OpenAI({ apiKey: key, ...(options.fetchImpl ? { fetch: options.fetchImpl } : {}), maxRetries: 1 });
      const content: OpenAI.Responses.ResponseInputMessageContentList = [];
      request.images.forEach((image, index) => {
        content.push({ type: 'input_text', text: `Angle ${index + 1}:` });
        content.push({ type: 'input_image', image_url: `data:${image.mimeType};base64,${image.base64}`, detail: 'high' });
      });
      // The user's own words come last, after any photos, so they read as a correction to them.
      if (request.note) content.push({ type: 'input_text', text: request.images.length
        ? `The person who ate this adds: ${request.note}` : `The person describes the meal: ${request.note}` });
      const response = await client.responses.create({
        model,
        instructions: PROMPT,
        input: [{ role: 'user', content }],
        text: { format: { type: 'json_schema', name: 'meal', schema: SCHEMA, strict: true } },
      }, { signal: controller.signal });
      res.json(normalizeVision(JSON.parse(response.output_text)));
    } catch (cause) {
      // Swallowing this is how a 502 became unreadable in production: the log said nothing about
      // whether the key was rejected, the model was wrong, or the provider was simply down.
      const failure = describeProviderFailure(cause, controller.signal.aborted);
      logProviderFailure('vision', model, cause, failure);
      if (!res.destroyed) res.status(failure.status).json({ error: { code: failure.code, message: failure.message } });
    } finally { clearTimeout(timer); res.off('close', disconnect); }
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error?.type === 'entity.too.large' ? 413 : 400).json({ error: { code: 'INVALID_BODY', message: 'Invalid or oversized JSON image body.' } });
  };
  router.use(errors);
  return router;
}
