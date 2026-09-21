import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadActivity, type ActivityDay } from '../activityHistory';

type Row = Record<string, unknown>;
/** Just enough of the PostgREST builder for the one query this module makes. */
const clientWith = (rows: Row[]) => {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lte']) builder[method] = () => builder;
  builder.order = async () => ({ data: rows, error: null });
  return { from: () => builder } as never;
};
const row = (over: Row) => ({
  activity_date: '2026-09-21', steps: null, active_energy_kcal: null,
  distance_m: null, duration_seconds: null, steps_estimated: false, ...over,
});
const load = (rows: Row[]) => loadActivity('alice', '2026-09-01', '2026-09-30', clientWith(rows));

test('a phone and a watch are one day of walking, not two', async () => {
  // Both report the same steps from the same legs; summing them would double the day.
  const days = await load([
    row({ source: 'healthkit', steps: 9000, active_energy_kcal: 400 }),
    row({ source: 'health-connect', steps: 8600, active_energy_kcal: 380 }),
  ]);
  assert.equal(days.length, 1);
  assert.equal(days[0].steps, 9000, 'the better-covered device wins');
  assert.equal(days[0].manual_steps, 0);
});

test('a treadmill the phone never saw adds to the day', async () => {
  const days = await load([
    row({ source: 'healthkit', steps: 9000, active_energy_kcal: 400 }),
    row({ source: 'treadmill', steps: 4200, active_energy_kcal: 250, distance_m: 3218.7, duration_seconds: 1800, steps_estimated: true }),
  ]);
  assert.equal(days[0].steps, 13_200);
  assert.equal(days[0].manual_steps, 4200, 'and the added part stays visible as its own figure');
  assert.equal(days[0].active_energy_kcal, 650);
  assert.equal(days[0].steps_estimated, true);
  assert.equal(days[0].source, 'healthkit+treadmill');
});

test('a treadmill day with no device reading is the treadmill, not nothing', async () => {
  const days = await load([row({ source: 'treadmill', steps: 4200, distance_m: 3218.7 })]);
  assert.equal(days[0].steps, 4200);
  assert.equal(days[0].source, 'treadmill');
  assert.equal(days[0].manual_steps, 4200);
  // A device day with nothing manual keeps reporting exactly what it measured.
  const measured = await load([row({ source: 'healthkit', steps: 7000 })]);
  assert.deepEqual([measured[0].steps, measured[0].manual_steps], [7000, 0]);
});

test('unreported energy stays unreported rather than becoming zero', async () => {
  const days = await load([
    row({ source: 'healthkit', steps: 9000, active_energy_kcal: null }),
    row({ source: 'treadmill', steps: 1000, active_energy_kcal: null }),
  ]);
  assert.equal(days[0].active_energy_kcal, null);
  // One side reporting is enough for the day to have a figure.
  const partial = await load([
    row({ source: 'healthkit', steps: 9000, active_energy_kcal: null }),
    row({ source: 'treadmill', steps: 1000, active_energy_kcal: 90 }),
  ]);
  assert.equal(partial[0].active_energy_kcal, 90);
});

test('days come back in order, whatever order the rows arrived in', async () => {
  const days = await load([
    row({ activity_date: '2026-09-21', source: 'treadmill', steps: 1000 }),
    row({ activity_date: '2026-09-19', source: 'healthkit', steps: 5000 }),
    row({ activity_date: '2026-09-20', source: 'healthkit', steps: 6000 }),
  ]);
  assert.deepEqual(days.map((day: ActivityDay) => day.activity_date), ['2026-09-19', '2026-09-20', '2026-09-21']);
});
