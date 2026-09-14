import type { MacroTotals } from '../../types/nutrition';
import { effectiveAge } from './birthDate';
import type { OnboardingProfile } from '../../types/profile';

export const GOAL_DIRECTIONS = ['auto', 'lose', 'maintain', 'gain', 'recomp'] as const;
export type GoalDirection = typeof GOAL_DIRECTIONS[number];
export const DIET_STYLES = ['balanced', 'high_protein', 'lower_carb', 'higher_carb', 'plant_forward'] as const;
export type DietStyle = typeof DIET_STYLES[number];
/** Weekly rates offered for losing or gaining. Beyond 1% of body weight per week costs lean mass. */
export const RATE_CHOICES = [0.5, 1, 1.5, 2] as const;

export interface LifestyleSurvey {
  age: number | null;
  /** Preferred over `age`, which is only kept so older profiles keep working. */
  birthDate?: string | null;
  metabolicSex: 'female' | 'male' | 'unspecified';
  composition: 'unsure' | 'lean' | 'balanced' | 'higher';
  priority: 'energy' | 'strength' | 'mobility';
  recovery: 'steady' | 'tired';
  specializedNutrition: boolean;
  skipAutomaticBudget?: boolean;
  /** 'auto' infers a direction from the lifestyle answers; anything else is the user's explicit choice. */
  goalDirection?: GoalDirection;
  /** Magnitude in lbs per week; ignored for maintain and recomp. */
  rateLbsPerWeek?: number;
  goalWeightLbs?: number | null;
  dietStyle?: DietStyle;
  trainingDaysPerWeek?: number;
}
export const defaultSurvey: LifestyleSurvey = {
  age: null, birthDate: null, metabolicSex: 'unspecified', composition: 'unsure', priority: 'energy', recovery: 'steady',
  specializedNutrition: false, goalDirection: 'auto', rateLbsPerWeek: 1, goalWeightLbs: null,
  dietStyle: 'balanced', trainingDaysPerWeek: 3,
};

export interface StartingBudget {
  tdeeKcal: number; restingKcal: number; rest: MacroTotals; training: MacroTotals;
  weeklyChangeLbs: number; direction: 'steady' | 'gradual increase' | 'gradual decrease';
  explanation: string;
  /** Set when the requested rate was reduced for safety, so the UI can say so plainly. */
  limitedBy: string | null;
  weeksToGoal: number | null;
  /** Distinct training days behind the split above; 0 on the simple track, where every day is the same. */
  trainingDayCount: number;
}

/** Distinct, in-range weekday numbers, so a malformed list cannot inflate the schedule. */
export function countTrainingDays(days: readonly number[] | null | undefined) {
  return new Set((days ?? []).filter(day => Number.isInteger(day) && day >= 0 && day <= 6)).size;
}

/**
 * Splits a daily average into a training-day and a rest-day figure covering the same week.
 * Training days rise by 90 kcal where the schedule affords it. The rise is paid for out of the
 * rest days, so a week with few rest days eases it back rather than gutting the ones that remain:
 * no rest day falls more than a tenth below the average. A week with no rest day — or none with
 * training — has nothing to shift between, and both figures stay at the average.
 */
export function dayCalories(average: number, trainingDays: number) {
  const restDays = 7 - trainingDays;
  if (trainingDays <= 0 || restDays <= 0) return { trainingCalories: average, restCalories: average };
  // Rounded down before it is multiplied back out, so the cap holds after the rest-day figure is rounded.
  const rise = Math.floor(Math.min(90, average * .1 * restDays / trainingDays));
  const trainingCalories = Math.round(average + rise);
  const restCalories = Math.round(average - (trainingCalories - average) * trainingDays / restDays);
  return { trainingCalories, restCalories };
}

/** Absolute intake floors below which a self-directed plan should not go. */
const FLOOR = { female: 1200, male: 1500, unspecified: 1300 } as const;
/**
 * Protein and fat are set per pound of body weight, not as a share of calories: a smaller
 * deficit should not mean less protein, and it is body weight that lean mass has to be
 * defended across. Fat is a flat 0.3 g/lb; protein sits in a band, 0.9–1.0 g/lb building and
 * 0.7–0.8 g/lb cutting or holding. Diet style only chooses where inside that band to sit.
 */
const FAT_PER_LB = 0.3;
const PROTEIN_BAND = { bulk: [0.9, 1.0], other: [0.7, 0.8] } as const;
/** 0 sits at the bottom of the band, 1 at the top. */
const PROTEIN_LEAN: Record<DietStyle, number> = {
  balanced: 0.5, high_protein: 1, lower_carb: 1, higher_carb: 0, plant_forward: 0,
};
export function proteinPerLb(dietStyle: DietStyle, bulking: boolean) {
  const [low, high] = PROTEIN_BAND[bulking ? 'bulk' : 'other'];
  return low + (high - low) * PROTEIN_LEAN[dietStyle];
}

/**
 * Carbohydrate is whatever the calorie target has left. At a low target on a heavy frame the
 * two fixed grams-per-pound figures can ask for more energy than the day contains, so they are
 * eased back together — keeping their ratio — rather than letting carbohydrate go negative.
 */
export function macroSplit(kcal: number, weightLbs: number, dietStyle: DietStyle, bulking: boolean): MacroTotals {
  let proteinG = weightLbs * proteinPerLb(dietStyle, bulking);
  let fatG = weightLbs * FAT_PER_LB;
  const fixed = proteinG * 4 + fatG * 9;
  const ceiling = kcal * 0.9;
  if (fixed > ceiling && fixed > 0) { const shrink = ceiling / fixed; proteinG *= shrink; fatG *= shrink; }
  proteinG = Math.round(proteinG); fatG = Math.round(fatG);
  return { caloriesKcal: kcal, proteinG, fatG, carbsG: Math.max(0, kcal - proteinG * 4 - fatG * 9) / 4 };
}

/** The weekly change the user actually asked for, in lbs; 0 for maintain, recomp and auto. */
export function intendedWeeklyChange(s: LifestyleSurvey | undefined | null) {
  const survey = { ...defaultSurvey, ...(s ?? {}) };
  if (survey.goalDirection === 'lose') return -(survey.rateLbsPerWeek ?? 1);
  if (survey.goalDirection === 'gain') return survey.rateLbsPerWeek ?? 1;
  return 0;
}
/** Lowest intake this app will ever recommend for someone, before resting need is considered. */
export function calorieFloor(s: LifestyleSurvey | undefined | null) {
  return FLOOR[({ ...defaultSurvey, ...(s ?? {}) }).metabolicSex];
}

function validate(p: OnboardingProfile, s: LifestyleSurvey) {
  if (!['female','male','unspecified'].includes(s.metabolicSex) || !['unsure','lean','balanced','higher'].includes(s.composition)
    || !['energy','strength','mobility'].includes(s.priority) || !['steady','tired'].includes(s.recovery)
    || !['sedentary','light','moderate','high'].includes(p.activity_level ?? '')) throw new Error('Complete the lifestyle choices.');
  if (!GOAL_DIRECTIONS.includes(s.goalDirection ?? 'auto')) throw new Error('Choose what you want your weight to do.');
  if (!DIET_STYLES.includes(s.dietStyle ?? 'balanced')) throw new Error('Choose how you prefer to eat.');
  if (s.skipAutomaticBudget) throw new Error('Automatic targets are turned off. You can track intake without a calorie recommendation.');
  const years = effectiveAge(s);
  if (years === null || !Number.isInteger(years) || years < 18 || years > 100) throw new Error('Automatic budgets are available for adults 18–100. Enter your date of birth.');
  if (s.specializedNutrition) throw new Error('Automatic targets are unavailable for pregnancy, breastfeeding, or clinician-managed nutrition. Use personal targets from your care team.');
  if (!Number.isFinite(p.weight_lbs) || p.weight_lbs! < 70 || p.weight_lbs! > 700 || !Number.isFinite(p.height_inches)
    || p.height_inches! < 48 || p.height_inches! > 90) throw new Error('Enter a height of 4–7 ft 6 in and a weight of 70–700 lbs.');
  const direction = s.goalDirection ?? 'auto';
  if ((direction === 'lose' || direction === 'gain') && !(RATE_CHOICES as readonly number[]).includes(s.rateLbsPerWeek ?? 1)) throw new Error('Choose how quickly you want your weight to change.');
  if (s.goalWeightLbs != null && (!Number.isFinite(s.goalWeightLbs) || s.goalWeightLbs < 70 || s.goalWeightLbs > 700)) throw new Error('A goal weight must be between 70 and 700 lbs.');
}

/** Mifflin–St Jeor expressed in pounds/inches; a starting estimate, refined later from real data. */
export function startingBudget(p: OnboardingProfile): StartingBudget {
  const s = { ...defaultSurvey, ...(p.lifestyle_survey ?? {}) };
  validate(p, s);
  const factor = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 }[p.activity_level ?? 'light'];
  const offset = s.metabolicSex === 'male' ? 5 : s.metabolicSex === 'female' ? -161 : -78;
  const restingKcal = 4.5359237 * p.weight_lbs! + 15.875 * p.height_inches! - 5 * effectiveAge(s)! + offset;
  const tdeeKcal = Math.round(restingKcal * factor);
  const bmi = 703.06958 * p.weight_lbs! / p.height_inches! ** 2;
  const direction = s.goalDirection ?? 'auto';

  let requested = 0;
  if (direction === 'lose') requested = -(s.rateLbsPerWeek ?? 1);
  else if (direction === 'gain') requested = s.rateLbsPerWeek ?? 1;
  else if (direction === 'auto') {
    // Legacy implicit inference for profiles that never answered the goal question.
    if (s.recovery === 'steady' && s.composition === 'lean' && s.priority === 'strength') requested = Math.min(150, tdeeKcal * .05) * 7 / 3500;
    if (s.recovery === 'steady' && s.composition === 'higher' && s.priority === 'mobility' && bmi >= 20) requested = -Math.min(250, tdeeKcal * .1) * 7 / 3500;
  }

  let limitedBy: string | null = null;
  const limit = (reason: string) => { limitedBy ??= reason; };
  // Under-recovered bodies do not tolerate a deficit; hold at maintenance until that changes.
  if (s.recovery === 'tired' && requested < 0) { requested = 0; limit('You told us you are often tired or under-fuelled, so this starts at maintenance rather than a deficit.'); }

  let change = requested * 3500 / 7;
  const maxDeficit = tdeeKcal * .25;
  if (change < -maxDeficit) { change = -maxDeficit; limit('That rate would need more than a quarter of your daily energy, so it has been eased back.'); }
  const maxSurplus = tdeeKcal * .2;
  if (change > maxSurplus) { change = maxSurplus; limit('A surplus that large mostly adds fat, so it has been eased back.'); }

  const floor = Math.max(FLOOR[s.metabolicSex], Math.round(restingKcal));
  let average = Math.round(tdeeKcal + change);
  if (average < floor) { average = floor; limit(`This plan holds at ${floor} kcal, which is your estimated resting need — going below it is not something an app should recommend.`); }

  const trainingDayCount = p.is_advanced_track ? countTrainingDays(p.training_days) : 0;
  const { trainingCalories, restCalories } = dayCalories(average, trainingDayCount);
  const bulking = change > 0;
  const macros = (kcal: number) => macroSplit(kcal, p.weight_lbs!, s.dietStyle ?? 'balanced', bulking);
  const weeklyChangeLbs = (average - tdeeKcal) * 7 / 3500;
  const goalWeight = s.goalWeightLbs ?? null;
  const weeksToGoal = goalWeight !== null && Math.abs(weeklyChangeLbs) > .01
    && Math.sign(goalWeight - p.weight_lbs!) === Math.sign(weeklyChangeLbs)
    ? Math.ceil(Math.abs(goalWeight - p.weight_lbs!) / Math.abs(weeklyChangeLbs)) : null;
  return {
    tdeeKcal, restingKcal, rest: macros(restCalories), training: macros(trainingCalories), weeklyChangeLbs, limitedBy, weeksToGoal, trainingDayCount,
    direction: weeklyChangeLbs > 0 ? 'gradual increase' : weeklyChangeLbs < 0 ? 'gradual decrease' : 'steady',
    explanation: s.metabolicSex === 'unspecified'
      ? 'A midpoint metabolic estimate has wider uncertainty. Your logged intake and weight trend will refine it.'
      : 'A starting estimate from your measurements, activity and recovery. CalCamp adjusts it as your real data comes in.',
  };
}

export function applyStartingBudget(p: OnboardingProfile): OnboardingProfile {
  const b = startingBudget(p);
  return { ...p, goal: b.weeklyChangeLbs > 0 ? 'bulk' : b.weeklyChangeLbs < 0 ? 'cut' : 'maintain', dynamic_tdee_kcal: b.tdeeKcal,
    rest_targets: b.rest, training_targets: p.is_advanced_track ? b.training : null,
    preworkout_carbs_g: p.preworkout_fast_carbs ? Math.min(p.preworkout_carbs_g || 30, b.training.carbsG) : 0 };
}
