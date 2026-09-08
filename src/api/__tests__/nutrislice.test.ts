import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fetchDailyMenu, normalizeMenuDate, NutrisliceError } from '../nutrislice';
import type { DiningHallSlug } from '../../types/campus';

const date = '2026-09-08';
const hall = 'busch-dining-hall';
const food = {
  id: 10,
  name: 'Rice',
  rounded_nutrition_info: { calories: 200, g_protein: 4, g_carbs: 45, g_fat: 0, mg_sodium: null },
  serving_size_info: { serving_size_amount: '1', serving_size_unit: 'cup' },
};
const row = { id: 100, food };
const week = (items: unknown[] = [row]) => ({
  days: [
    { date: '2026-09-07', menu_items: [{ id: 99, food: { ...food, name: 'Yesterday' } }] },
    { date, menu_items: items },
  ],
});
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const hasCode = (code: NutrisliceError['code']) => (error: unknown) => error instanceof NutrisliceError && error.code === code;

test('starts all three meals concurrently and extracts only the requested day', async () => {
  const calls: string[] = [];
  const release: ((response: Response) => void)[] = [];
  const fetchImpl: typeof fetch = (url) => {
    calls.push(String(url));
    return new Promise((resolve) => release.push(resolve));
  };
  const result = fetchDailyMenu(hall, date, { fetchImpl });
  assert.equal(calls.length, 3, 'Meals must not wait for each other');
  assert.deepEqual(calls.map((url) => url.split('/menu-type/')[1]), [
    'breakfast/2026/9/8/', 'lunch-test/2026/9/8/', 'dinner/2026/9/8/',
  ]);
  for (const resolve of release) resolve(json(week([row, { id: 101, food: null, is_section_title: true }])));
  const items = await result;
  assert.deepEqual(items.map((item) => item.meal), ['breakfast', 'lunch', 'dinner']);
  assert.equal(new Set(items.map((item) => item.id)).size, 3);
  assert.ok(items.every((item) => item.date === date && item.name === 'Rice'));
  assert.deepEqual(items[0].serving, { amount: 1, unit: 'cup', label: '1 cup' });
  assert.equal(items[0].macros.fatG, 0);
  assert.equal(items[0].nutrients.mg_sodium, null);
});

test('uses precise nutrition when available and retains unknown macros instead of inventing zeros', async () => {
  const items = await fetchDailyMenu(hall, date, {
    fetchImpl: async () => json(week([
      { id: 100, food: { ...food, nutrition_info: { calories: 201.25, g_protein: null } } },
      { id: 101, food: { id: 11, name: 'Unreported food' } },
    ])),
  });
  assert.equal(items[0].macros.caloriesKcal, 201.25);
  assert.equal(items[0].macros.proteinG, 4);
  assert.deepEqual(items[1].macros, { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null });
});

test('closed meals are empty but absent dates or malformed data are explicit errors', async () => {
  assert.deepEqual(await fetchDailyMenu(hall, date, { fetchImpl: async () => json(week([])) }), []);
  for (const payload of [
    { days: [] },
    { days: [{ date, menu_items: 'changed structure' }] },
    week([{ id: 100, food: { ...food, rounded_nutrition_info: { calories: -1 } } }]),
    { days: [{ date, menu_items: [] }, { date, menu_items: [] }] },
  ]) {
    await assert.rejects(fetchDailyMenu(hall, date, { fetchImpl: async () => json(payload) }), hasCode('INVALID_RESPONSE'));
  }
});

test('a failed meal rejects the entire day rather than presenting partial data', async () => {
  await assert.rejects(fetchDailyMenu(hall, date, {
    fetchImpl: async (url) => String(url).includes('dinner') ? new Response('Unavailable', { status: 503 }) : json(week()),
  }), (error: unknown) => error instanceof NutrisliceError && error.code === 'UPSTREAM_HTTP' && error.status === 503);
});

test('falls back once using the same calendar day and validates the proxy response', async () => {
  const menu = await fetchDailyMenu(hall, date, { fetchImpl: async () => json(week()) });
  const calls: string[] = [];
  const items = await fetchDailyMenu(hall, date, {
    fallbackBaseUrl: 'https://proxy.example',
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).startsWith('https://proxy.example')) return json(menu);
      throw new TypeError('Browser network or CORS failure');
    },
  });
  assert.deepEqual(items, menu);
  assert.equal(calls.filter((url) => url.startsWith('https://proxy.example')).length, 1);
  assert.ok(calls.includes(`https://proxy.example/api/nutrislice/daily-menu?diningHall=${hall}&date=${date}`));
  await assert.rejects(fetchDailyMenu(hall, date, {
    fallbackBaseUrl: 'https://proxy.example',
    fetchImpl: async (url) => {
      if (String(url).startsWith('https://proxy.example')) return json(menu.map((item) => ({ ...item, date: '2026-09-09' })));
      throw new TypeError('Network error');
    },
  }), hasCode('INVALID_RESPONSE'));
});

test('bounds the entire request including a stalled response body', async () => {
  const stalled: typeof fetch = async () => new Response(new ReadableStream());
  await assert.rejects(fetchDailyMenu(hall, date, { timeoutMs: 20, fetchImpl: stalled }), hasCode('TIMEOUT'));
});

test('cancellation aborts meal requests and does not trigger the proxy', async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  const signals: AbortSignal[] = [];
  const pending = fetchDailyMenu(hall, date, {
    signal: controller.signal,
    fallbackBaseUrl: 'https://proxy.example',
    fetchImpl: (url, options) => {
      calls.push(String(url));
      signals.push(options!.signal!);
      return new Promise(() => {});
    },
  });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls.length, 3);
  assert.ok(signals.every((signal) => signal.aborted));
});

test('validates inputs before fetching and interprets Date objects in the campus timezone', async () => {
  const fetchImpl: typeof fetch = async () => assert.fail('Invalid input must not fetch');
  for (const invalid of ['2026-02-30', '2026-9-8', 'not-a-date', new Date(NaN)]) {
    await assert.rejects(fetchDailyMenu(hall, invalid, { fetchImpl }), hasCode('INVALID_INPUT'));
  }
  await assert.rejects(fetchDailyMenu('https://attacker.example' as DiningHallSlug, date, { fetchImpl }), hasCode('INVALID_INPUT'));
  await assert.rejects(fetchDailyMenu(hall, date, { fetchImpl, fallbackBaseUrl: 'https://proxy.example/other-path' }), hasCode('INVALID_INPUT'));
  assert.equal(normalizeMenuDate(new Date('2026-09-08T02:00:00Z')), '2026-09-07');
  assert.equal(normalizeMenuDate('2028-02-29'), '2028-02-29');
});
