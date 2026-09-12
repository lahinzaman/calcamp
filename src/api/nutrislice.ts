import { breadcrumb } from '../modules/telemetry/events';
import { isDiningHallSlug, type DiningHallSlug } from '../types/campus';
import {
  MEAL_TYPES,
  type DailyMenuItem,
  type MealType,
  type NutrisliceFood,
  type NutrisliceMenuItem,
  type NutrisliceNutritionInfo,
  type NutrisliceWeekResponse,
} from '../types/nutrislice';

import type { RescueMeal } from '../types/rescue';
export type { DailyMenuItem } from '../types/nutrislice';

const API_ORIGIN = 'https://rutgers.api.nutrislice.com';
const DEFAULT_TIMEOUT_MS = 12_000;

// Verified at /menu/api/schools/?format=json on 2026-09-08. All four halls
// advertise lunch-test; /menu-type/lunch/ returns 404, not an empty menu.
const UPSTREAM_MEAL_SLUGS: Record<MealType, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch-test',
  dinner: 'dinner',
};

export type NutrisliceErrorCode =
  | 'INVALID_INPUT'
  | 'UPSTREAM_HTTP'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'NETWORK';

export class NutrisliceError extends Error {
  fallbackMeals?: RescueMeal[];
  constructor(
    public readonly code: NutrisliceErrorCode,
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NutrisliceError';
  }
}

export interface FetchDailyMenuOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Explicit HTTP(S) proxy origin, e.g. https://api.example.com. */
  fallbackBaseUrl?: string;
}

function invalidResponse(message: string): never {
  throw new NutrisliceError('INVALID_RESPONSE', message);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonnegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || nonnegativeNumber(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function identifier(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function validDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

/** Date objects use Rutgers' America/New_York calendar day, independent of device zone. */
export function normalizeMenuDate(date: Date | string): string {
  let value: unknown = date;
  if (date instanceof Date && Number.isFinite(date.getTime())) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
    value = `${part('year')}-${part('month')}-${part('day')}`;
  }
  if (!validDateString(value)) {
    throw new NutrisliceError('INVALID_INPUT', 'date must be a valid Date or YYYY-MM-DD calendar date.');
  }
  return value;
}

function parseNutrition(value: unknown): NutrisliceNutritionInfo | null {
  if (value === undefined || value === null) return null;
  if (!record(value)) invalidResponse('Expected an object for food nutrition.');
  const result: NutrisliceNutritionInfo = {};
  for (const [key, nutrient] of Object.entries(value)) {
    if (!nullableNumber(nutrient)) invalidResponse(`Invalid nutrient value for ${key}.`);
    // defineProperty avoids treating an untrusted __proto__ key as a setter.
    Object.defineProperty(result, key, { value: nutrient, enumerable: true });
  }
  return result;
}

function parseFood(value: unknown): NutrisliceFood {
  if (!record(value) || !identifier(value.id) || typeof value.name !== 'string' || !value.name.trim()) {
    invalidResponse('A food item is missing a valid ID or name.');
  }
  const servingInfo = value.serving_size_info;
  if (servingInfo != null && (!record(servingInfo)
    || !nullableString(servingInfo.serving_size_amount)
    || !nullableString(servingInfo.serving_size_unit))) {
    invalidResponse('Invalid food serving_size_info.');
  }
  return {
    id: value.id,
    name: value.name.trim(),
    nutrition_info: parseNutrition(value.nutrition_info),
    rounded_nutrition_info: parseNutrition(value.rounded_nutrition_info),
    serving_size_info: servingInfo == null ? null : {
      serving_size_amount: servingInfo.serving_size_amount as string | null,
      serving_size_unit: servingInfo.serving_size_unit as string | null,
    },
  };
}

function parseMenuItem(value: unknown): NutrisliceMenuItem {
  if (!record(value) || !identifier(value.id)) invalidResponse('Invalid menu item ID.');
  for (const key of ['is_section_title', 'is_station_header'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') invalidResponse(`Invalid ${key}.`);
  }
  for (const key of ['serving_size', 'serving_size_unit', 'text'] as const) {
    if (value[key] !== undefined && !nullableString(value[key])) invalidResponse(`Invalid ${key}.`);
  }
  if (value.serving_size_amount !== undefined && !nullableNumber(value.serving_size_amount)) {
    invalidResponse('Invalid serving_size_amount.');
  }
  if (value.food === undefined) invalidResponse('Menu item is missing its food field.');
  return {
    id: value.id,
    food: value.food === null ? null : parseFood(value.food),
    is_section_title: value.is_section_title as boolean | undefined,
    is_station_header: value.is_station_header as boolean | undefined,
    text: value.text as string | null | undefined,
    serving_size: value.serving_size as string | null | undefined,
    serving_size_amount: value.serving_size_amount as number | null | undefined,
    serving_size_unit: value.serving_size_unit as string | null | undefined,
  };
}

/** Validates the consumed contract and discards irrelevant upstream presentation fields. */
export function parseNutrisliceWeek(value: unknown): NutrisliceWeekResponse {
  if (!record(value) || !Array.isArray(value.days)) invalidResponse('Expected a week response with days.');
  return {
    days: value.days.map((day) => {
      if (!record(day) || !validDateString(day.date) || !Array.isArray(day.menu_items)) {
        invalidResponse('Invalid menu day or menu_items array.');
      }
      return { date: day.date, menu_items: day.menu_items.map(parseMenuItem) };
    }),
  };
}

function abortError(): Error {
  const error = new Error('The menu request was cancelled.');
  error.name = 'AbortError';
  return error;
}

async function fetchJson(url: string, options: FetchDailyMenuOptions): Promise<unknown> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = options;
  if (signal?.aborted) throw abortError();
  const controller = new AbortController();
  let cancel: (reason: Error) => void = () => {};
  const cancellation = new Promise<never>((_, reject) => { cancel = reject; });
  const onAbort = () => { cancel(abortError()); controller.abort(); };
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => {
    cancel(new NutrisliceError('TIMEOUT', `Menu request exceeded ${timeoutMs}ms.`));
    controller.abort();
  }, timeoutMs);

  try {
    const request = (async (): Promise<unknown> => {
      let response: Response;
      try {
        response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      } catch (cause) {
        if (controller.signal.aborted) throw abortError();
        throw new NutrisliceError('NETWORK', 'Unable to reach the menu service.', undefined, cause);
      }
      if (!response.ok) {
        const error = new NutrisliceError('UPSTREAM_HTTP', `Menu service returned HTTP ${response.status}.`, response.status);
        // Accept only the normalized, sourced catalog contract from our configured proxy.
        if (options.fallbackBaseUrl && new URL(url).origin === new URL(options.fallbackBaseUrl).origin) {
          const body: unknown = await response.json().catch(() => null);
          if (record(body) && record(body.error) && record(body.error.fallback) && body.error.fallback.kind === 'rescue-catalog'
            && body.error.fallback.availabilityVerified === false && Array.isArray(body.error.fallback.meals)) {
            error.fallbackMeals = body.error.fallback.meals.filter((meal): meal is RescueMeal => record(meal)
              && typeof meal.id === 'string' && typeof meal.name === 'string' && typeof meal.reviewedAt === 'string'
              && typeof meal.sourceUrl === 'string' && meal.sourceUrl.startsWith('https://') && record(meal.macros)
              && ['caloriesKcal','proteinG','carbsG','fatG'].every(k => nonnegativeNumber((meal.macros as Record<string, unknown>)[k])));
          }
        }
        throw error;
      }
      try {
        return await response.json();
      } catch (cause) {
        if (controller.signal.aborted) throw abortError();
        throw new NutrisliceError('INVALID_RESPONSE', 'Menu service did not return valid JSON.', undefined, cause);
      }
    })();
    return await Promise.race([request, cancellation]);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Header rows carry the station name; a row is a header when it has no food of its own. */
export function stationName(item: NutrisliceMenuItem): string | null {
  if (!item.is_section_title && !item.is_station_header) return null;
  const text = item.text?.trim();
  return text ? text : null;
}
function normalizeItem(item: NutrisliceMenuItem, diningHall: DiningHallSlug, date: string, meal: MealType, station: string | null): DailyMenuItem | null {
  const food = item.food;
  if (!food || item.is_section_title || item.is_station_header) return null;
  const nutrients: NutrisliceNutritionInfo = { ...food.rounded_nutrition_info };
  for (const [key, value] of Object.entries(food.nutrition_info ?? {})) {
    if (value != null || nutrients[key] === undefined) nutrients[key] = value;
  }
  const sourceAmount = food.serving_size_info?.serving_size_amount;
  const parsedAmount = sourceAmount?.trim() ? Number(sourceAmount) : null;
  return {
    id: `${diningHall}:${date}:${meal}:${item.id}`,
    diningHall, date, meal, station, menuItemId: item.id, foodId: food.id, name: food.name,
    serving: {
      amount: item.serving_size_amount ?? (nonnegativeNumber(parsedAmount) ? parsedAmount : null),
      unit: item.serving_size_unit ?? food.serving_size_info?.serving_size_unit ?? null,
      label: item.serving_size ?? (sourceAmount && food.serving_size_info?.serving_size_unit
        ? `${sourceAmount} ${food.serving_size_info.serving_size_unit}` : null),
    },
    macros: {
      caloriesKcal: nutrients.calories ?? null,
      proteinG: nutrients.g_protein ?? null,
      carbsG: nutrients.g_carbs ?? null,
      fatG: nutrients.g_fat ?? null,
    },
    nutrients,
  };
}

function parseProxyMenu(value: unknown, diningHall: DiningHallSlug, date: string): DailyMenuItem[] {
  if (!Array.isArray(value)) invalidResponse('Expected a daily menu array from the proxy.');
  return value.map((item) => {
    if (!record(item) || item.diningHall !== diningHall || item.date !== date
      || !MEAL_TYPES.some((meal) => item.meal === meal)
      || !identifier(item.menuItemId) || !identifier(item.foodId)
      || typeof item.id !== 'string' || !item.id
      || typeof item.name !== 'string' || !item.name.trim()
      || !nullableString(item.station ?? null)
      || !record(item.serving) || !nullableNumber(item.serving.amount)
      || !nullableString(item.serving.unit) || !nullableString(item.serving.label)
      || !record(item.macros)
      || !['caloriesKcal', 'proteinG', 'carbsG', 'fatG'].every((key) => nullableNumber((item.macros as Record<string, unknown>)[key]))
      || !record(item.nutrients)) {
      invalidResponse('The proxy returned an invalid or mismatched daily menu item.');
    }
    // Construct the public shape only after runtime checks; ignore unknown fields.
    return {
      ...(item.dataFreshness === 'stale' ? { dataFreshness: 'stale' as const } : {}),
      ...(typeof item.cachedAt === 'string' ? { cachedAt: item.cachedAt } : {}),
      id: item.id, diningHall, date, meal: item.meal as MealType,
      station: (item.station as string | null | undefined) ?? null,
      menuItemId: item.menuItemId, foodId: item.foodId, name: item.name,
      serving: {
        amount: item.serving.amount, unit: item.serving.unit, label: item.serving.label,
      },
      macros: {
        caloriesKcal: item.macros.caloriesKcal as number | null,
        proteinG: item.macros.proteinG as number | null,
        carbsG: item.macros.carbsG as number | null,
        fatG: item.macros.fatG as number | null,
      },
      nutrients: parseNutrition(item.nutrients) ?? {},
    };
  });
}

/** Concurrent breakfast/lunch/dinner, exact calendar day only, all-or-nothing.
 * Empty menu_items is a valid closed/unpublished meal. HTTP failures (including
 * 404) and absent requested days are errors, never disguised as empty menus.
 * A configured proxy is tried once after direct failure, never after cancellation.
 */
export async function fetchDailyMenu(
  diningHall: DiningHallSlug,
  date: Date | string,
  options: FetchDailyMenuOptions = {},
): Promise<DailyMenuItem[]> {
  if (!isDiningHallSlug(diningHall)) throw new NutrisliceError('INVALID_INPUT', 'Unknown dining hall.');
  const calendarDate = normalizeMenuDate(date);
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 60_000)) {
    throw new NutrisliceError('INVALID_INPUT', 'timeoutMs must be greater than 0 and no more than 60000.');
  }
  let proxyOrigin: string | undefined;
  if (options.fallbackBaseUrl !== undefined) {
    try {
      const proxyUrl = new URL(options.fallbackBaseUrl);
      if (!['http:', 'https:'].includes(proxyUrl.protocol) || proxyUrl.username || proxyUrl.password
        || proxyUrl.pathname !== '/' || proxyUrl.search || proxyUrl.hash) throw new Error('Expected an origin.');
      proxyOrigin = proxyUrl.origin;
    } catch {
      throw new NutrisliceError('INVALID_INPUT', 'fallbackBaseUrl must be an HTTP(S) origin without credentials, path, query or fragment.');
    }
  }
  if (options.signal?.aborted) throw abortError();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const [year, month, day] = calendarDate.split('-').map(Number);
  try {
    const results = await Promise.all(MEAL_TYPES.map(async (meal) => {
      const url = `${API_ORIGIN}/menu/api/weeks/school/${diningHall}/menu-type/${UPSTREAM_MEAL_SLUGS[meal]}/${year}/${month}/${day}/`;
      const week = parseNutrisliceWeek(await fetchJson(url, { ...options, signal: controller.signal }));
      const days = week.days.filter((entry) => entry.date === calendarDate);
      if (days.length !== 1) invalidResponse('The menu response must contain exactly one requested calendar day.');
      // Stations are implied by position: a header row names the station for the rows below it.
      let station: string | null = null;
      const foods: DailyMenuItem[] = [];
      for (const item of days[0].menu_items) {
        if (item.is_section_title || item.is_station_header) { station = stationName(item); continue; }
        const food = normalizeItem(item, diningHall, calendarDate, meal, station);
        if (food) foods.push(food);
      }
      return foods;
    }));
    return results.flat();
  } catch (error) {
    controller.abort();
    if (options.signal?.aborted) throw abortError();
    if (!proxyOrigin) throw error;
    breadcrumb('api.fallback', { source: 'nutrislice', outcome: 'unavailable' });
    const query = `diningHall=${encodeURIComponent(diningHall)}&date=${calendarDate}`;
    const menu = parseProxyMenu(await fetchJson(`${proxyOrigin}/api/nutrislice/daily-menu?${query}`, options), diningHall, calendarDate);
    if (menu.some(item => item.dataFreshness === 'stale')) breadcrumb('api.fallback', { source: 'nutrislice', outcome: 'stale' });
    return menu;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
}
