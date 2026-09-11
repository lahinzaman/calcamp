import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { MEASUREMENT_FIELDS, loadMeasurements, measurementRow, saveMeasurement } from '../../api/measurements';

test('unmeasured fields are written as null rather than zero', () => {
  const row = measurementRow('alice', { id: 'm1', measured_on: '2026-09-11', note: null, waist_in: 32 });
  assert.equal(row.waist_in, 32);
  // Everything not measured today stays unknown.
  for (const [field] of MEASUREMENT_FIELDS.filter(([name]) => name !== 'waist_in')) assert.equal(row[field], null);
  assert.equal(row.user_id, 'alice');
  assert.equal(row.measured_on, '2026-09-11');
});

test('saving requires at least one real measurement', async () => {
  const client = createClient('https://test.supabase.co', 'key', { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => Response.json([]) } });
  await assert.rejects(() => saveMeasurement('alice', { id: 'm1', measured_on: '2026-09-11', note: null }, client), /at least one measurement/);
  await assert.rejects(() => saveMeasurement('alice', { id: 'm1', measured_on: '2026-09-11', note: null, waist_in: null }, client), /at least one measurement/);
  await saveMeasurement('alice', { id: 'm1', measured_on: '2026-09-11', note: null, body_fat_percent: 18 }, client);
});

test('measurement history reads back in date order', async () => {
  const rows = [{ id: 'm1', measured_on: '2026-08-01', waist_in: 34, note: null }, { id: 'm2', measured_on: '2026-09-01', waist_in: 32, note: null }];
  const client = createClient('https://test.supabase.co', 'key', { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => Response.json(rows) } });
  const history = await loadMeasurements('alice', '2026-08-01', '2026-09-11', client);
  assert.equal(history.length, 2);
  assert.equal(history[0].waist_in, 34);
  assert.equal(history[1].waist_in, 32);
});
