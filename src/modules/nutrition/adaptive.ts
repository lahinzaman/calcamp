import type { TdeeEstimate } from './tdee';
export const KCAL_PER_POUND = 3500;
const WEEK_MS = 7 * 86_400_000;
/** Largest weekly move, so a noisy fortnight cannot swing the budget wildly. */
export const MAX_STEP_KCAL = 250;
/** Below this the plan is working; adjusting would be chasing noise. */
export const TOLERANCE_LBS_PER_WEEK = 0.15;

export interface AdaptiveInput {
  currentTargetKcal: number;
  /** Negative to lose, positive to gain, zero to hold. */
  intendedWeeklyChangeLbs: number;
  estimate: TdeeEstimate;
  floorKcal: number;
}
export interface Adjustment {
  status: 'measuring' | 'on-track' | 'adjust';
  nextTargetKcal: number;
  deltaKcal: number;
  observedWeeklyChangeLbs: number | null;
  measuredTdeeKcal: number | null;
  reason: string;
}

/**
 * Measured expenditure is the ground truth once enough days exist: the next target is
 * that figure plus the energy the intended rate needs. The step cap and floor keep a
 * single noisy window from producing an unreasonable recommendation.
 */
export function nextTarget(input: AdaptiveInput): Adjustment {
  const { currentTargetKcal, intendedWeeklyChangeLbs, estimate, floorKcal } = input;
  if (!Number.isFinite(currentTargetKcal) || currentTargetKcal <= 0) throw new RangeError('A current calorie target is required.');
  if (estimate.status !== 'ready' || estimate.tdeeKcal === null) {
    return { status: 'measuring', nextTargetKcal: currentTargetKcal, deltaKcal: 0,
      observedWeeklyChangeLbs: estimate.weightChangeLbsPerDay === null ? null : estimate.weightChangeLbsPerDay * 7,
      measuredTdeeKcal: null,
      reason: `This needs 14 days with both a weigh-in and a complete food log. You have ${estimate.adherentDays}.` };
  }
  const observed = estimate.weightChangeLbsPerDay! * 7;
  const drift = observed - intendedWeeklyChangeLbs;
  const desired = estimate.tdeeKcal + intendedWeeklyChangeLbs * KCAL_PER_POUND / 7;
  const capped = Math.max(currentTargetKcal - MAX_STEP_KCAL, Math.min(currentTargetKcal + MAX_STEP_KCAL, desired));
  const nextTargetKcal = Math.round(Math.max(floorKcal, capped));
  const deltaKcal = nextTargetKcal - currentTargetKcal;
  if (Math.abs(drift) < TOLERANCE_LBS_PER_WEEK || deltaKcal === 0) {
    return { status: 'on-track', nextTargetKcal: currentTargetKcal, deltaKcal: 0, observedWeeklyChangeLbs: observed,
      measuredTdeeKcal: Math.round(estimate.tdeeKcal),
      reason: `You are moving ${Math.abs(observed).toFixed(2)} lbs a week, which matches the plan. Nothing to change.` };
  }
  const faster = Math.abs(observed) > Math.abs(intendedWeeklyChangeLbs);
  return { status: 'adjust', nextTargetKcal, deltaKcal, observedWeeklyChangeLbs: observed,
    measuredTdeeKcal: Math.round(estimate.tdeeKcal),
    reason: `Your measured expenditure is ${Math.round(estimate.tdeeKcal)} kcal and you are ${observed >= 0 ? 'gaining' : 'losing'} ${Math.abs(observed).toFixed(2)} lbs a week` +
      `${faster ? ', faster than planned' : ', slower than planned'}. ${deltaKcal > 0 ? 'Add' : 'Remove'} ${Math.abs(deltaKcal)} kcal a day.` };
}

/** Weekly cadence: a target reviewed more often than the trend can move is just noise. */
export function isReviewDue(lastReviewedAtMs: number | null, now = Date.now()) {
  return lastReviewedAtMs === null || now - lastReviewedAtMs >= WEEK_MS;
}
export function daysUntilReview(lastReviewedAtMs: number | null, now = Date.now()) {
  if (lastReviewedAtMs === null) return 0;
  return Math.max(0, Math.ceil((lastReviewedAtMs + WEEK_MS - now) / 86_400_000));
}
