import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { loadHistory, shiftDate } from '../../api/history';
import { calculateTdee } from '../nutrition/tdee';
import { lbsToKg } from '../../lib/units';

test('date shifting crosses months and rejects malformed dates', () => {
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2026-09-10', -27), '2026-08-14');
  assert.throws(() => shiftDate('not-a-date', 1));
});

test('history rows convert stored kilograms to pounds and keep unknown values null', async () => {
  const rows = [
    { log_date: '2026-09-09', calories_kcal: 2100, protein_g: 150, carbs_g: 200, fat_g: 70, is_adherent: true, body_weight_kg: lbsToKg(180) },
    { log_date: '2026-09-10', calories_kcal: null, protein_g: null, carbs_g: null, fat_g: null, is_adherent: false, body_weight_kg: null },
  ];
  const client = createClient('https://test.supabase.co', 'key', { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => Response.json(rows) } });
  const history = await loadHistory('alice', '2026-09-09', '2026-09-10', client);
  assert.equal(Math.round(history[0].body_weight_lbs!), 180);
  assert.equal(history[0].calories_kcal, 2100);
  // An unlogged day stays null so the estimator can exclude it rather than read it as zero.
  assert.equal(history[1].calories_kcal, null);
  assert.equal(history[1].body_weight_lbs, null);
});

test('the expenditure estimate the Trends screen renders needs 14 paired adherent days', () => {
  const build = (count: number) => Array.from({ length: count }, (_, i) => ({
    log_date: shiftDate('2026-09-10', -(count - 1 - i)),
    calories_kcal: 2500, body_weight_lbs: 180 - i * 0.05, is_adherent: true,
  }));
  const thin = calculateTdee(build(13), { windowDays: 28, asOfDate: '2026-09-10' });
  assert.equal(thin.status, 'insufficient-data');
  assert.equal(thin.tdeeKcal, null);
  assert.equal(thin.adherentDays, 13);
  const ready = calculateTdee(build(20), { windowDays: 28, asOfDate: '2026-09-10' });
  assert.equal(ready.status, 'ready');
  // Losing weight on 2500 kcal means expenditure exceeds intake.
  assert.ok(ready.tdeeKcal! > 2500);
  assert.equal(ready.weightTrend.length, 20);
  assert.ok(ready.weightChangeLbsPerDay! < 0);
});
