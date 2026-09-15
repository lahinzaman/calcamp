import { Router, json, type ErrorRequestHandler } from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { structuredLimit as rateLimit } from './http';
import { describeProviderFailure, logProviderFailure } from './provider-error';
import { verifyBearer } from './supabase-auth';
import { fetchPublicHtml, UnsafeUrl, type SafeFetchOptions } from './safe-fetch';

export interface RecipeIngredient {
  name: string;
  grams: number;
  /** The model's own estimate for `grams`; the client replaces it wherever USDA has the food. */
  macros: { caloriesKcal: number; proteinG: number; carbsG: number; fatG: number };
}
export interface RecipeImport {
  title: string;
  servings: number;
  ingredients: RecipeIngredient[];
  /** What the page did not say — an unstated yield, a vague quantity. Shown, never guessed past. */
  note: string | null;
}

const MAX_INGREDIENTS = 40;
/** Roughly 6k tokens of page. Recipe pages bury the method under comments and related links. */
const MAX_TEXT = 24_000;
const DEFAULT_MODEL = 'gpt-5.6-terra';

const PROMPT = `You are reading one recipe off a web page. The text is a whole page: navigation, comments and unrelated recipes may surround the one that matters. Work only from the recipe the page is about.

Report:
- title: the recipe's own name, as the page gives it.
- servings: how many servings it makes. If the page does not say, use your best reading of the quantities and say so in "note".
- ingredients: every ingredient, each with
  - name: the plainest generic name for the food — what a nutrition database would call it, not what the recipe calls it. "oats, cooked" over "rolled oats", "butter" over "a knob of butter". Drop quantities, brands and preparation instructions from the name.
  - grams: the weight of that ingredient IN THE WHOLE RECIPE, not per serving. Convert cups, spoons and counts to grams using ordinary weights.
  - macros: calories, protein, carbs and fat for that many grams.

Do not invent an ingredient the page does not list, and do not merge two into one. If the page is not a recipe at all, return an empty ingredients array.`;

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'servings', 'ingredients', 'note'],
  properties: {
    title: { type: 'string' },
    servings: { type: 'number' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'grams', 'macros'],
        properties: {
          name: { type: 'string' }, grams: { type: 'number' },
          macros: {
            type: 'object', additionalProperties: false,
            required: ['caloriesKcal', 'proteinG', 'carbsG', 'fatG'],
            properties: { caloriesKcal: { type: 'number' }, proteinG: { type: 'number' },
              carbsG: { type: 'number' }, fatG: { type: 'number' } },
          },
        },
      },
    },
    note: { type: ['string', 'null'] },
  },
} as const;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", frac12: '1/2', frac14: '1/4', frac34: '3/4' };

/**
 * A numeric entity, or null when it names nothing a string can hold. `&#99999999;` is outside
 * Unicode and `String.fromCodePoint` throws on it, which took a whole recipe page down over one
 * malformed character in a comment.
 */
function codePoint(name: string): string | null {
  const decimal = /^#(\d{1,7})$/.exec(name);
  const hex = /^#x([0-9a-f]{1,6})$/i.exec(name);
  if (!decimal && !hex) return null;
  const value = decimal ? Number(decimal[1]) : parseInt(hex![1], 16);
  // Surrogates are not standalone characters; above 0x10FFFF is not a character at all.
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return null;
  return String.fromCodePoint(value);
}

/**
 * Tags out, words in. Structured recipe data (schema.org JSON-LD) is kept rather than stripped
 * with the other scripts: it is the same page saying the same thing without the prose around
 * it, and a model reading both gets the quantities right far more often.
 */
export function htmlToText(html: string): string {
  const structured: string[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    if (/"recipe"/i.test(match[1])) structured.push(match[1]);
  }
  const prose = html
    .replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = `${structured.join('\n')}\n${prose}`
    .replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? codePoint(name) ?? whole)
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n')
    .trim();
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
}

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid provider object.');
  return value as ObjectValue;
}
const amount = (value: unknown, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;

/** A page that yields no usable ingredient is a failed import, not a recipe of nothing. */
export function normalizeRecipe(value: unknown): RecipeImport {
  const data = object(value);
  if (!Array.isArray(data.ingredients)) throw new Error('Provider returned no ingredient list.');
  const ingredients: RecipeIngredient[] = [];
  for (const entry of data.ingredients.slice(0, MAX_INGREDIENTS)) {
    const item = object(entry);
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 150) : '';
    const grams = amount(item.grams, 20_000);
    const macros = object(item.macros);
    const totals = {
      caloriesKcal: amount(macros.caloriesKcal, 40_000), proteinG: amount(macros.proteinG, 5000),
      carbsG: amount(macros.carbsG, 5000), fatG: amount(macros.fatG, 5000),
    };
    // A partial ingredient is dropped rather than completed with zeros.
    if (!name || !grams || Object.values(totals).some(entry => entry === null)) continue;
    ingredients.push({ name, grams, macros: totals as RecipeIngredient['macros'] });
  }
  if (!ingredients.length) throw new Error('No recipe was found on that page.');
  const servings = amount(data.servings, 100);
  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim().slice(0, 80) : 'Imported recipe';
  const note = typeof data.note === 'string' && data.note.trim() ? data.note.trim().slice(0, 300) : null;
  return { title, servings: servings && servings >= 1 ? servings : 1, ingredients, note };
}

export interface RecipeProxyOptions extends SafeFetchOptions {
  authenticate?: (bearer: string) => Promise<string | null>;
  apiKey?: () => string | undefined;
  model?: string;
  openAiFetch?: typeof fetch;
}
export function createRecipeProxyRouter(options: RecipeProxyOptions = {}) {
  const router = Router();
  const authenticate = options.authenticate ?? verifyBearer;
  const apiKey = options.apiKey ?? (() => process.env.OPENAI_API_KEY);
  const model = options.model ?? (process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL);
  router.use(cors({ origin: process.env.VISION_ALLOWED_ORIGIN?.split(',') ?? false,
    methods: ['POST'], allowedHeaders: ['Content-Type', 'Authorization'] }));
  router.use(rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.post('/', async (req, res, next) => {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    if (!match) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in to import a recipe.' } }); return; }
    try {
      const userId = await authenticate(match[1]);
      if (!userId) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Your session is invalid or expired.' } }); return; }
      res.locals.userId = userId; next();
    } catch { res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' } }); }
  }, rateLimit({ windowMs: 60_000, limit: 6, keyGenerator: (_req, res) => res.locals.userId as string,
    standardHeaders: 'draft-8', legacyHeaders: false }), json({ limit: '4kb' }), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const raw = (req.body as { url?: unknown } | null)?.url;
    if (typeof raw !== 'string' || !raw.trim() || raw.length > 2048) {
      res.status(400).json({ error: { code: 'INVALID_URL', message: 'Send the address of a recipe page.' } }); return;
    }
    let key: string | undefined;
    try { key = apiKey(); } catch { /* Invalid server config stays private. */ }
    if (!key) { res.status(503).json({ error: { code: 'NOT_CONFIGURED', message: 'Recipe import is not configured on this server.' } }); return; }

    let text: string;
    try { text = htmlToText(await fetchPublicHtml(raw.trim(), options)); }
    catch (cause) {
      const message = cause instanceof UnsafeUrl ? cause.message : 'That page could not be read. Check the address and try again.';
      res.status(400).json({ error: { code: 'FETCH_FAILED', message } }); return;
    }
    if (text.length < 200) { res.status(422).json({ error: { code: 'NOT_A_RECIPE', message: 'There was not enough on that page to read a recipe from.' } }); return; }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnect);
    try {
      const client = new OpenAI({ apiKey: key, ...(options.openAiFetch ? { fetch: options.openAiFetch } : {}), maxRetries: 1 });
      const response = await client.responses.create({
        model, instructions: PROMPT,
        input: [{ role: 'user', content: [{ type: 'input_text', text }] }],
        text: { format: { type: 'json_schema', name: 'recipe', schema: SCHEMA, strict: true } },
      }, { signal: controller.signal });
      res.json(normalizeRecipe(JSON.parse(response.output_text)));
    } catch (cause) {
      // Swallowing this is how a 502 became unreadable in production: the log said nothing about
      // whether the key was rejected, the model was wrong, or the provider was simply down.
      const failure = describeProviderFailure(cause, controller.signal.aborted);
      logProviderFailure('recipe', model, cause, failure);
      if (!res.destroyed) res.status(failure.status).json({ error: { code: failure.code, message: failure.message } });
    } finally { clearTimeout(timer); res.off('close', disconnect); }
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error?.type === 'entity.too.large' ? 413 : 400).json({ error: { code: 'INVALID_BODY', message: 'Invalid or oversized JSON body.' } });
  };
  router.use(errors);
  return router;
}
