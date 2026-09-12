import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MIN_FORECAST_SAMPLES, gymEstimate } from '../busyness/estimate';
import type { GymBaseline, GymForecast, GymSummary } from '../../types/facilities';

const report = (over: Partial<GymSummary>): GymSummary =>
  ({ location_slug: 'werblin', vote_count: 3, crowd_score: 90, latest_vote_at: new Date().toISOString(), ...over });
const forecast = (over: Partial<GymForecast>): GymForecast =>
  ({ location_slug: 'werblin', forecast_score: 40, sample_count: 12, ...over });
const baseline = (over: Partial<GymBaseline>): GymBaseline =>
  ({ slug: 'werblin', baseline: 20, checkedAt: new Date().toISOString(), status: 'available', ...over });

test('busyness prefers someone in the room, then this hour, then the provider', () => {
  assert.equal(gymEstimate({ report: report({}), forecast: forecast({}), baseline: baseline({}) }).source, 'reports');
  // Reports older than the window stop counting as "right now".
  const stale = report({ latest_vote_at: new Date(Date.now() - 31 * 60_000).toISOString() });
  assert.equal(gymEstimate({ report: stale, forecast: forecast({}), baseline: baseline({}) }).source, 'community');
  assert.equal(gymEstimate({ report: stale, baseline: baseline({}) }).source, 'provider');
  assert.equal(gymEstimate({ report: stale }).source, 'none');
});

test('a forecast from too few reports is withheld rather than presented as a pattern', () => {
  const thin = gymEstimate({ forecast: forecast({ sample_count: MIN_FORECAST_SAMPLES - 1, forecast_score: 100 }) });
  assert.equal(thin.source, 'none');
  assert.equal(thin.score, null);
  assert.ok(thin.detail.includes(String(MIN_FORECAST_SAMPLES - 1)));
  assert.equal(gymEstimate({ forecast: forecast({ sample_count: MIN_FORECAST_SAMPLES }) }).source, 'community');
  // No data at all invites the first report instead of blaming a service.
  assert.ok(gymEstimate({}).detail.includes('first'));
});
