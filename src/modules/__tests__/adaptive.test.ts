import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isReviewDue, daysUntilReview, nextTarget, MAX_STEP_KCAL } from '../nutrition/adaptive';
import { startingBudget, defaultSurvey, RATE_CHOICES, macroSplit, proteinPerLb } from '../onboarding/budget';
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

test('protein and fat are set per pound of body weight, and carbohydrate takes what is left', () => {
  // The rule, stated: 0.9-1.0 g/lb protein building, 0.7-0.8 cutting or holding, 0.3 g/lb fat
  // throughout. Diet style only chooses where inside the protein band to sit.
  for (const style of ['balanced', 'high_protein', 'lower_carb', 'higher_carb', 'plant_forward'] as const) {
    assert.ok(proteinPerLb(style, true) >= 0.9 && proteinPerLb(style, true) <= 1, style);
    assert.ok(proteinPerLb(style, false) >= 0.7 && proteinPerLb(style, false) <= 0.8, style);
  }
  assert.equal(proteinPerLb('high_protein', false), 0.8);
  assert.equal(proteinPerLb('higher_carb', false), 0.7);

  const cut = macroSplit(2000, 180, 'balanced', false);
  assert.equal(cut.proteinG, 135); assert.equal(cut.fatG, 54);
  assert.equal(cut.proteinG * 4 + cut.carbsG * 4 + cut.fatG * 9, 2000);
  // The same body eating more gets more protein per pound, and the rest of the rise as carbs.
  const bulk = macroSplit(2800, 180, 'balanced', true);
  assert.equal(bulk.proteinG, 171); assert.equal(bulk.fatG, 54);
  assert.ok(bulk.carbsG > cut.carbsG);

  // Grams per pound do not care about the calorie target, so a heavy frame on a low one can ask
  // for more energy than the day holds. Both ease back together rather than carbs going negative.
  const squeezed = macroSplit(1500, 300, 'balanced', false);
  assert.ok(squeezed.carbsG >= 0);
  assert.ok(squeezed.proteinG / 300 < 0.7 && squeezed.fatG / 300 < 0.3, 'both were eased, not just one');
  assert.ok(Math.abs((squeezed.proteinG / 0.75) / (squeezed.fatG / 0.3) - 300 / 300) < 0.1, 'their ratio held');
  assert.equal(squeezed.proteinG * 4 + squeezed.carbsG * 4 + squeezed.fatG * 9, 1500);
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

test('rescaling a target holds protein and the fat share, and stays balanced', () => {
  const { rescale } = require('../nutrition/targetReview') as typeof import('../nutrition/targetReview');
  const current = { caloriesKcal: 2400, proteinG: 180, carbsG: 270, fatG: 75 };
  const next = rescale(current, 2150);
  assert.equal(next.caloriesKcal, 2150);
  assert.equal(next.proteinG, 180, 'protein is protected when calories fall');
  assert.equal(next.proteinG * 4 + next.carbsG * 4 + next.fatG * 9, next.caloriesKcal);
  assert.ok(next.carbsG < current.carbsG, 'the reduction comes out of carbs and fat');
  // Protein cannot exceed 35% of a much smaller budget.
  const tiny = rescale(current, 1500);
  assert.ok(tiny.proteinG <= 1500 * .35 / 4);
  assert.ok(tiny.carbsG >= 0);
});

test('the intended weekly change reflects the goal the user chose', () => {
  const { intendedWeeklyChange, calorieFloor } = require('../onboarding/budget') as typeof import('../onboarding/budget');
  assert.equal(intendedWeeklyChange({ ...defaultSurvey, goalDirection: 'lose', rateLbsPerWeek: 1.5 }), -1.5);
  assert.equal(intendedWeeklyChange({ ...defaultSurvey, goalDirection: 'gain', rateLbsPerWeek: 0.5 }), 0.5);
  assert.equal(intendedWeeklyChange({ ...defaultSurvey, goalDirection: 'maintain' }), 0);
  // Recomp holds weight steady; the change comes from body composition, not the scale.
  assert.equal(intendedWeeklyChange({ ...defaultSurvey, goalDirection: 'recomp' }), 0);
  assert.equal(intendedWeeklyChange(null), 0);
  assert.equal(calorieFloor({ ...defaultSurvey, metabolicSex: 'female' }), 1200);
  assert.equal(calorieFloor({ ...defaultSurvey, metabolicSex: 'male' }), 1500);
});

test('the weekly weigh-in reminder schedules on the chosen weekday', () => {
  const { reminderPlan, defaultPreferences, parsePreferences } = require('../notifications/policy') as typeof import('../notifications/policy');
  const prefs = { ...defaultPreferences, enabled: true, weighInReminders: true, weighInDay: 3, weighInTime: '07:30' };
  const plan = reminderPlan(prefs, null);
  const weighIn = plan.find(reminder => reminder.kind === 'weigh-in')!;
  assert.ok(weighIn, 'a weigh-in reminder should be scheduled');
  // Expo weekdays are 1-7 starting at Sunday, so Wednesday (3) becomes 4.
  assert.equal(weighIn.weekday, 4);
  assert.equal(weighIn.hour, 7);
  assert.equal(weighIn.minute, 30);
  assert.equal(reminderPlan({ ...prefs, weighInReminders: false }, null).some(r => r.kind === 'weigh-in'), false);
  assert.equal(reminderPlan({ ...prefs, enabled: false }, null).length, 0);
  assert.throws(() => parsePreferences({ ...prefs, weighInDay: 9 }));
  assert.throws(() => parsePreferences({ ...prefs, weighInTime: '25:00' }));
  assert.equal(parsePreferences(prefs).weighInDay, 3);
});
