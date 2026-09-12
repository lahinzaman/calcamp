import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import { findRescueMeals, matchPlaces } from '../places';
import { createCampusProxyRouter, validateRescueRequest } from '../campus-proxy';
import { EASTON_AVE, rescueEligible } from '../../src/types/rescue';
const remaining = { caloriesKcal: 500, proteinG: 50, carbsG: 60, fatG: 12 };
const night = new Date('2026-09-08T02:00:00Z');
const place = { id: 'chipotle-1', displayName: { text: 'Chipotle Mexican Grill' }, businessStatus: 'OPERATIONAL', currentOpeningHours: { openNow: true }, rating: 4.3, userRatingCount: 120 };
test('restaurant matching excludes closed, unknown, low-rated, and any over-budget meal', () => {
  const results = matchPlaces([place, { ...place, id: 'closed', currentOpeningHours: { openNow: false } }, { ...place, id: 'unrated', rating: 3 }, { ...place, id: 'local', displayName: { text: 'Local Grill' } }], remaining, 'protein', night);
  assert.equal(results.eligibleRestaurants, 2); assert.equal(results.uncoveredRestaurants, 1); assert.equal(results.matches.length, 2);
  assert.equal(matchPlaces([place], { ...remaining, fatG: 8 }, 'protein').matches.length, 0);
  assert.equal(matchPlaces([place], { ...remaining, carbsG: 20 }, 'protein').matches.length, 0);
  assert.equal(matchPlaces([place], { ...remaining, proteinG: 35 }, 'protein').matches.length, 0);
  const carbMeals = matchPlaces([place], { ...remaining, carbsG: 100 }, 'carbs').matches;
  assert.equal(carbMeals[0].meal.id, 'chipotle-rice-beans');
});
test('Places receives coordinates but no user macros or identity; request uses New API fields', async () => {
  await findRescueMeals(EASTON_AVE, remaining, 'protein', { key: 'private-places', fetchImpl: async (url, init) => {
    assert.equal(url, 'https://places.googleapis.com/v1/places:searchNearby');
    const body = JSON.parse(init!.body as string); assert.deepEqual(body.locationRestriction.circle.center, EASTON_AVE);
    assert.equal(body.remaining, undefined); assert.equal(body.userId, undefined);
    assert.equal((init!.headers as Record<string, string>)['X-Goog-Api-Key'], 'private-places'); return Response.json({ places: [place] });
  } });
});
test('macro rescue gate is strictly after 10 PM and above 400 kcal; invalid coordinates fail', () => {
  assert.equal(rescueEligible(remaining, night), true);
  assert.equal(rescueEligible(remaining, new Date('2026-09-08T01:59:59Z')), false);
  assert.equal(rescueEligible(remaining, new Date('2026-09-08T04:00:00Z')), false);
  assert.equal(rescueEligible({ ...remaining, caloriesKcal: 400 }, night), false);
  assert.throws(() => validateRescueRequest({ location: { latitude: NaN, longitude: 0 }, remaining, preference: 'protein' }));
});
test('campus endpoints require auth and late-night eligibility before spending provider requests', async () => {
  let requests = 0;
  const app = express().use('/api/campus', createCampusProxyRouter({ authenticate: async token => token === 'valid' ? 'alice' : null, now: () => night,
    rescue: async () => { requests++; return { matches: [], eligibleRestaurants: 0, uncoveredRestaurants: 0, checkedAt: night.toISOString() }; } }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/campus`;
    const post = (body: unknown) => fetch(`${base}/rescue`, { method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ location: EASTON_AVE, remaining: { ...remaining, caloriesKcal: 400 }, preference: 'protein' })).status, 409);
    assert.equal(requests, 0);
    assert.equal((await post({ location: EASTON_AVE, remaining, preference: 'protein' })).status, 200); assert.equal(requests, 1);
    assert.equal((await post({ location: { latitude: 91, longitude: 0 }, remaining, preference: 'protein' })).status, 400);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
