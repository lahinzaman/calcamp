import { resolveItems } from '../modules/vision/resolveItems';
import type { Recipe, RecipeItem } from '../modules/foods/recipes';

export type RecipeImportCode = 'NOT_CONFIGURED' | 'INVALID_URL' | 'FETCH_FAILED' | 'NOT_A_RECIPE' | 'REQUEST_FAILED' | 'TIMEOUT';
export class RecipeImportError extends Error {
  constructor(public readonly code: RecipeImportCode, message: string) { super(message); this.name = 'RecipeImportError'; }
}

interface ImportedIngredient { name: string; grams: number; macros: { caloriesKcal: number; proteinG: number; carbsG: number; fatG: number } }
interface ImportedRecipe { title: string; servings: number; ingredients: ImportedIngredient[]; note: string | null }

const newId = () => globalThis.crypto?.randomUUID?.() ?? `recipe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function parseImportedRecipe(value: unknown): ImportedRecipe {
  const payload = value as Partial<ImportedRecipe> | null;
  if (!payload || !Array.isArray(payload.ingredients) || !payload.ingredients.length) {
    throw new RecipeImportError('NOT_A_RECIPE', 'No recipe could be read from that page.');
  }
  const ingredients = payload.ingredients.map(entry => {
    const macros = entry?.macros;
    if (!entry || typeof entry.name !== 'string' || !entry.name.trim() || !number(entry.grams) || entry.grams <= 0
      || !macros || !(['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const).every(key => number(macros[key]))) {
      throw new RecipeImportError('NOT_A_RECIPE', 'That page produced an ingredient without a weight or macros.');
    }
    return { name: entry.name.trim(), grams: entry.grams, macros };
  });
  return {
    title: typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim().slice(0, 80) : 'Imported recipe',
    servings: number(payload.servings) && payload.servings! >= 1 ? payload.servings! : 1,
    ingredients,
    note: typeof payload.note === 'string' && payload.note.trim() ? payload.note.trim() : null,
  };
}

/**
 * The imported page becomes a draft recipe, not a saved one. Each ingredient goes through the
 * same USDA resolution the photo and description flows use, so a resolved one carries measured
 * figures and the full micronutrient profile, and an unresolved one keeps the model's estimate
 * and says so on its own row. Every ingredient is one serving of its own gram weight, so the
 * builder's ± control re-portions it the way it re-portions anything else.
 */
export function toRecipeDraft(imported: ImportedRecipe): { recipe: Recipe; resolved: number; estimated: number } {
  const rows = resolveItems(imported.ingredients.map(item => ({ ...item, confidence: 1 })));
  const items: RecipeItem[] = rows.map(row => ({
    name: row.name, servings: 1, macros: row.macros, micros: row.micros,
    note: row.source === 'usda' ? `${Math.round(row.grams)} g · USDA: ${row.matchedName}` : `${Math.round(row.grams)} g · estimated, no USDA match`,
  }));
  return {
    recipe: { id: newId(), name: imported.title, yieldServings: imported.servings, items, updatedAtMs: Date.now() },
    resolved: rows.filter(row => row.source === 'usda').length,
    estimated: rows.filter(row => row.source === 'estimated').length,
  };
}

const MESSAGES: Record<string, string> = {
  NOT_CONFIGURED: 'Recipe import is not set up on this build. Build the recipe by hand instead.',
  INVALID_URL: 'That does not look like a web address. Paste the link to the recipe page.',
  FETCH_FAILED: 'That page could not be read. Check the address and try again.',
  NOT_A_RECIPE: 'No recipe could be found on that page.',
  TIMEOUT: 'That page took too long to read. Try again, or build the recipe by hand.',
};

/** Posts the URL to the authenticated proxy; the page is fetched server-side, never here. */
export async function importRecipe(url: string, signal: AbortSignal, accessToken?: () => Promise<string | null>): Promise<ImportedRecipe> {
  const endpoint = process.env.EXPO_PUBLIC_RECIPE_IMPORT_URL
    || (process.env.EXPO_PUBLIC_BACKEND_URL ? `${process.env.EXPO_PUBLIC_BACKEND_URL.replace(/\/$/, '')}/api/recipe` : null);
  if (!endpoint) throw new RecipeImportError('NOT_CONFIGURED', MESSAGES.NOT_CONFIGURED);
  const token = accessToken ? await accessToken() : await (async () => {
    const { getSupabase } = await import('./supabase');
    const { data, error } = await getSupabase().auth.getSession();
    if (error) throw error;
    return data.session?.access_token ?? null;
  })();
  if (!token) throw new RecipeImportError('NOT_CONFIGURED', 'Sign in before importing a recipe.');
  const response = await fetch(endpoint, { method: 'POST', signal,
    body: JSON.stringify({ url }), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    const code = body?.error?.code ?? 'REQUEST_FAILED';
    throw new RecipeImportError((MESSAGES[code] ? code : 'REQUEST_FAILED') as RecipeImportCode,
      body?.error?.message ?? MESSAGES[code] ?? 'That recipe could not be imported.');
  }
  return parseImportedRecipe(await response.json());
}
