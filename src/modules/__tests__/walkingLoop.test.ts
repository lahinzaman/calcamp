import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLLEGE_AVE, generateWalkingLoop, parseWalkingRoute, stepDeficit } from '../routing/walkingLoop';
const route = (distance: number) => ({ code: 'Ok', routes: [{ distance, duration: 600,
  geometry: { type: 'LineString', coordinates: [COLLEGE_AVE, [-74.451, 40.503], COLLEGE_AVE] } }] });
test('step deficit never goes negative and rejects unknown or invalid data', () => {
  assert.deepEqual(stepDeficit(8000), { remainingSteps: 2000, distanceMeters: 1500 });
  assert.equal(stepDeficit(11000).distanceMeters, 0);
  assert.throws(() => stepDeficit(NaN)); assert.throws(() => stepDeficit(-1));
});
test('walking loop search uses closed walking waypoints and reports actual distance mismatch', async () => {
  let calls = 0;
  const loop = await generateWalkingLoop(COLLEGE_AVE, 1500, { token: 'pk.test', fetchImpl: async input => {
    const url = new URL(String(input)); assert.ok(url.pathname.startsWith('/directions/v5/mapbox/walking/'));
    const coordinates = url.pathname.split('/').at(-1)!.split(';'); assert.equal(coordinates[0], coordinates.at(-1));
    calls++; return Response.json(route(calls <= 3 ? 2200 : 1575));
  } });
  assert.equal(calls, 4); assert.equal(loop.distanceMeters, 1575); assert.equal(loop.differenceMeters, 75); assert.equal(loop.withinTolerance, true);
});
test('closed-route validation, provider errors, and cancellation cannot produce a fake route', async () => {
  assert.equal(parseWalkingRoute({ code: 'NoRoute' }, 1000), null);
  assert.throws(() => parseWalkingRoute({ code: 'Ok', routes: [{ distance: -1 }] }, 1000));
  await assert.rejects(generateWalkingLoop(COLLEGE_AVE, 0, { token: 'pk.test' }));
  await assert.rejects(generateWalkingLoop(COLLEGE_AVE, 1000, { token: 'pk.test', fetchImpl: async () => Response.json({ code: 'NoRoute' }) }), /No walkable/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(generateWalkingLoop(COLLEGE_AVE, 1000, { token: 'pk.test', signal: controller.signal,
    fetchImpl: async () => Response.json(route(1000)) }), /cancelled/);
});
