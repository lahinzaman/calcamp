import type { GymBaseline, GymForecast, GymSummary } from '../../types/facilities';

export type BusynessSource = 'reports' | 'community' | 'provider' | 'none';
export interface BusynessEstimate { score: number | null; source: BusynessSource; detail: string }
/** Below this, one person's opinion would be presented as a pattern. */
export const MIN_FORECAST_SAMPLES = 3;
export const REPORT_WINDOW_MS = 30 * 60_000;
export const crowdWord = (score: number) => score < 25 ? 'Quiet' : score < 75 ? 'Normal' : 'Packed';

/**
 * Sources in order of how well they describe the room right now: someone standing in it,
 * then what this hour usually looks like, then a provider's weekly curve. Each estimate
 * carries the reason it was chosen so the screen never shows a bare number.
 */
export function gymEstimate(input: { report?: GymSummary; forecast?: GymForecast; baseline?: GymBaseline; now?: number }): BusynessEstimate {
  const now = input.now ?? Date.now();
  const { report, forecast, baseline } = input;
  const votedAt = report?.latest_vote_at ? Date.parse(report.latest_vote_at) : NaN;
  if (report && report.vote_count > 0 && report.crowd_score !== null && Number.isFinite(votedAt) && now - votedAt < REPORT_WINDOW_MS) {
    const score = Number(report.crowd_score);
    return { score, source: 'reports',
      detail: `${report.vote_count} student report${report.vote_count === 1 ? '' : 's'} in the last 30 minutes · ${crowdWord(score)}` };
  }
  if (forecast && forecast.forecast_score !== null && forecast.sample_count >= MIN_FORECAST_SAMPLES) {
    const score = Number(forecast.forecast_score);
    return { score, source: 'community',
      detail: `Usually ${crowdWord(score).toLowerCase()} at this hour · ${forecast.sample_count} past reports` };
  }
  if (baseline && baseline.baseline !== null) {
    return { score: baseline.baseline, source: 'provider',
      detail: baseline.stale ? 'Saved provider forecast · waiting for a live update' : 'Provider forecast of the weekly pattern' };
  }
  const short = forecast && forecast.sample_count > 0 && forecast.sample_count < MIN_FORECAST_SAMPLES;
  return { score: null, source: 'none',
    detail: short ? `Only ${forecast!.sample_count} report${forecast!.sample_count === 1 ? '' : 's'} for this hour so far — a few more and an estimate appears here.`
      : 'No estimate yet. Be the first to report it and this hour starts building a pattern.' };
}
