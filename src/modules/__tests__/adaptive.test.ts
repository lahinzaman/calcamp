import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isReviewDue, daysUntilReview, nextTarget, MAX_STEP_KCAL } from '../nutrition/adaptive';
import { startingBudget, defaultSurvey, RATE_CHOICES } from '../onboarding/budget';
import type { TdeeEstimate } from '../nutrition/tdee';

const estimate = (over: Partial<TdeeEstimate> = {}): TdeeEstimate => ({
  status: 'ready', tdeeKcal: 2600, averageIntakeKcal: 2400, weightChangeLbsPerDay: -0.0571,
  storedEnergyChangeKcalPerDay: -200, adherentDays: 20, coverage: .71, weightTrend: [], ...over,
});

test('an unfinished measurement never changes the target', () => {
  const result = nextTarget({ currentTargetKcal: 2400, intendedWeeklyChangeLbs: -1, floorKcal: 1500,
    estimate: estimate({ status: 'insufficient-data', tdeeKcal: null, weightChangeLbsPerDay: null, adherentDays: 6 }) });
  assert.equal(result.status, 'measuring');
  assert.equal(result.nextTargetKcal, 2400);
  assert.equal(result.deltaKcal, 0);
  assert.match(result.reason, /You have 6/);
});

test('a plan tracking within tolerance is left alone', () => {
  // Intending -1 lb/wk and observing -0.40 lb/day * 7 is within noise of the plan.
  const result = nextTarget({ currentTargetKcal: 2400, intendedWeeklyChangeLbs: -1, floorKcal: 1500,
    estimate: estimate({ weightChangeLbsPerDay: -1.05 / 7 }) });
  assert.equal(result.status, 'on-track');
  assert.equal(result.deltaKcal, 0);
  assert.match(result.reason, /matches the plan/);
});

test('losing faster than planned raises calories toward measured expenditure', () => {
  const result = nextTarget({ currentTargetKcal: 2000, intendedWeeklyChangeLbs: -1, floorKcal: 1500,
    estimate: estimate({ tdeeKcal: 2600, weightChangeLbsPerDay: -2 / 7 }) });
  assert.equal(result.status, 'adjust');
  assert.ok(result.deltaKcal > 0, 'should add calories when dropping too fast');
  // 2600 measured minus the 500/day a 1 lb week needs is 2100, inside one capped step of 2000.
  assert.equal(result.nextTargetKcal, 2100);
  assert.ok(Math.abs(result.deltaKcal) <= MAX_STEP_KCAL);
  assert.match(result.reason, /faster than planned/);
});

test('stalling on a cut lowers calories, and the floor is never breached', () => {
  const result = nextTarget({ currentTargetKcal: 1600, intendedWeeklyChangeLbs: -1, floorKcal: 1500,
    estimate: estimate({ tdeeKcal: 1700, weightChangeLbsPerDay: 0 }) });
  assert.equal(result.status, 'adjust');
  assert.ok(result.deltaKcal < 0);
  assert.ok(result.nextTargetKcal >= 1500, 'must not drop below the floor');
  // A deeper cut would be needed to hit the rate; the floor wins over the arithmetic.
  const hard = nextTarget({ currentTargetKcal: 1550, intendedWeeklyChangeLbs: -2, floorKcal: 1500,
    estimate: estimate({ tdeeKcal: 1600, weightChangeLbsPerDay: 0 }) });
  assert.equal(hard.nextTargetKcal, 1500);
});

test('a single move is capped in both directions', () => {
  const up = nextTarget({ currentTargetKcal: 1800, intendedWeeklyChangeLbs: 0, floorKcal: 1200, estimate: estimate({ tdeeKcal: 3200, weightChangeLbsPerDay: -1 / 7 }) });
  assert.equal(up.nextTargetKcal, 1800 + MAX_STEP_KCAL);
  const down = nextTarget({ currentTargetKcal: 3200, intendedWeeklyChangeLbs: 0, floorKcal: 1200, estimate: estimate({ tdeeKcal: 1900, weightChangeLbsPerDay: 1 / 7 }) });
  assert.equal(down.nextTargetKcal, 3200 - MAX_STEP_KCAL);
  assert.throws(() => nextTarget({ currentTargetKcal: 0, intendedWeeklyChangeLbs: 0, floorKcal: 1200, estimate: estimate() }));
});

test('reviews run weekly, not more often', () => {
  const now = Date.parse('2026-09-11T12:00:00Z');
  assert.equal(isReviewDue(null, now), true);
  assert.equal(isReviewDue(now - 6 * 86_400_000, now), false);
  assert.equal(isReviewDue(now - 7 * 86_400_000, now), true);
  assert.equal(daysUntilReview(now - 5 * 86_400_000, now), 2);
  assert.equal(daysUntilReview(null, now), 0);
});

test('explicit goals drive the budget, and unsafe rates are eased back and explained', () => {
  const base = { ...defaultSurvey, age: 30, metabolicSex: 'male' as const };
  const profile = { ...require('../../store/onboardingStore').useOnboardingStore.getState().draft,
    height_inches: 70, weight_lbs: 200, activity_level: 'moderate' as const };

  const cut = startingBudget({ ...profile, lifestyle_survey: { ...base, goalDirection: 'lose', rateLbsPerWeek: 1 } });
  assert.equal(cut.direction, 'gradual decrease');
  assert.ok(Math.abs(cut.weeklyChangeLbs + 1) < .02, 'a 1 lb/week cut should be honoured');

  const bulk = startingBudget({ ...profile, lifestyle_survey: { ...base, goalDirection: 'gain', rateLbsPerWeek: 0.5 } });
  assert.equal(bulk.direction, 'gradual increase');
  assert.ok(bulk.rest.caloriesKcal > cut.rest.caloriesKcal);

  const hold = startingBudget({ ...profile, lifestyle_survey: { ...base, goalDirection: 'maintain' } });
  assert.equal(hold.direction, 'steady');
  assert.equal(hold.limitedBy, null);

  // Recomp eats at maintenance; the protein target is what differs.
  const recomp = startingBudget({ ...profile, lifestyle_survey: { ...base, goalDirection: 'recomp', dietStyle: 'high_protein' } });
  assert.equal(recomp.direction, 'steady');
  assert.ok(recomp.rest.proteinG > hold.rest.proteinG);

  // The fastest rate exceeds a quarter of daily energy for this person and is eased back.
  const aggressive = startingBudget({ ...profile, lifestyle_survey: { ...base, goalDirection: 'lose', rateLbsPerWeek: RATE_CHOICES.at(-1)! } });
  assert.ok(aggressive.limitedBy, 'an unsafe rate must be explained');
  assert.ok(Math.abs(aggressive.weeklyChangeLbs) < 2);

  // Being under-recovered blocks a deficit entirely.
  const tired = startingBudget({ ...profile, lifestyle_survey: { ...base, goalDirection: 'lose', rateLbsPerWeek: 1, recovery: 'tired' } });
  assert.equal(tired.weeklyChangeLbs, 0);
  assert.match(tired.limitedBy!, /tired/);
});

test('every diet style still balances macros to its calorie target, and goal ETA is directional', () => {
  const base = { ...defaultSurvey, age: 30, metabolicSex: 'female' as const, goalDirection: 'lose' as const, rateLbsPerWeek: 1 };
  const profile = { ...require('../../store/onboardingStore').useOnboardingStore.getState().draft,
    height_inches: 65, weight_lbs: 170, activity_level: 'light' as const };
  for (const dietStyle of ['balanced','high_protein','lower_carb','higher_carb','plant_forward'] as const) {
    const budget = startingBudget({ ...profile, lifestyle_survey: { ...base, dietStyle } });
    const macros = budget.rest;
    assert.equal(macros.proteinG * 4 + macros.carbsG * 4 + macros.fatG * 9, macros.caloriesKcal, dietStyle);
    assert.ok(macros.carbsG >= 0, `${dietStyle} must not produce negative carbs`);
  }
  const reachable = startingBudget({ ...profile, lifestyle_survey: { ...base, goalWeightLbs: 150 } });
  assert.ok(reachable.weeksToGoal && reachable.weeksToGoal > 0);
  // A goal weight in the opposite direction to the plan has no honest ETA.
  const wrongWay = startingBudget({ ...profile, lifestyle_survey: { ...base, goalWeightLbs: 190 } });
  assert.equal(wrongWay.weeksToGoal, null);
});
