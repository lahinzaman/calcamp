import type { MacroTotals } from '../../types/nutrition';
import type { OnboardingProfile } from '../../types/profile';
export interface LifestyleSurvey {
  age: number | null;
  metabolicSex: 'female' | 'male' | 'unspecified';
  composition: 'unsure' | 'lean' | 'balanced' | 'higher';
  priority: 'energy' | 'strength' | 'mobility';
  recovery: 'steady' | 'tired';
  specializedNutrition: boolean;
  skipAutomaticBudget?: boolean;
}
export const defaultSurvey: LifestyleSurvey = { age: null, metabolicSex: 'unspecified', composition: 'unsure', priority: 'energy', recovery: 'steady', specializedNutrition: false };
export interface StartingBudget { tdeeKcal: number; rest: MacroTotals; training: MacroTotals; weeklyChangeLbs: number; direction: 'steady' | 'gradual increase' | 'gradual decrease'; explanation: string }
/** Mifflin–St Jeor expressed in pounds/inches; starting estimate, never inferred from photos. */
export function startingBudget(p: OnboardingProfile): StartingBudget {
  const s = p.lifestyle_survey ?? defaultSurvey;
  if (!['female','male','unspecified'].includes(s.metabolicSex) || !['unsure','lean','balanced','higher'].includes(s.composition) || !['energy','strength','mobility'].includes(s.priority) || !['steady','tired'].includes(s.recovery) || !['sedentary','light','moderate','high'].includes(p.activity_level ?? '')) throw new Error('Complete the lifestyle choices.');
  if (s.skipAutomaticBudget) throw new Error('Automatic targets are turned off. You can track intake without a calorie recommendation.');
  if (!Number.isInteger(s.age) || s.age! < 18 || s.age! > 100) throw new Error('Automatic budgets are available for adults 18–100. Enter your age.');
  if (s.specializedNutrition) throw new Error('Automatic targets are unavailable for pregnancy, breastfeeding, or clinician-managed nutrition. Use personal targets from your care team.');
  if (!Number.isFinite(p.weight_lbs) || p.weight_lbs! < 70 || p.weight_lbs! > 700 || !Number.isFinite(p.height_inches) || p.height_inches! < 48 || p.height_inches! > 90) throw new Error('Enter a height of 4–7 ft 6 in and a weight of 70–700 lbs.');
  const factor = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 }[p.activity_level ?? 'light'];
  const offset = s.metabolicSex === 'male' ? 5 : s.metabolicSex === 'female' ? -161 : -78;
  const resting = 4.5359237 * p.weight_lbs! + 15.875 * p.height_inches! - 5 * s.age! + offset;
  const tdeeKcal = Math.round(resting * factor);
  const bmi = 703.06958 * p.weight_lbs! / p.height_inches! ** 2;
  let change = 0;
  if (s.recovery === 'steady' && s.composition === 'lean' && s.priority === 'strength') change = Math.min(150, tdeeKcal * .05);
  if (s.recovery === 'steady' && s.composition === 'higher' && s.priority === 'mobility' && bmi >= 20) change = -Math.min(250, tdeeKcal * .1);
  const average = Math.round(Math.max(resting, tdeeKcal + change));
  // Four training days / three rest days preserve the weekly calorie budget.
  const trainingCalories = p.is_advanced_track ? average + 90 : average;
  const restCalories = p.is_advanced_track ? average - 120 : average;
  const macros = (kcal: number): MacroTotals => {
    const proteinG = Math.round(Math.min(p.weight_lbs! * (p.is_advanced_track ? .8 : .7), kcal * .3 / 4));
    const fatG = Math.round(kcal * .28 / 9);
    const carbsG = (kcal - proteinG * 4 - fatG * 9) / 4;
    return { caloriesKcal: kcal, proteinG, carbsG, fatG };
  };
  const weeklyChangeLbs = (average - tdeeKcal) * 7 / 3500;
  return { tdeeKcal, rest: macros(restCalories), training: macros(trainingCalories), weeklyChangeLbs,
    direction: weeklyChangeLbs > 0 ? 'gradual increase' : weeklyChangeLbs < 0 ? 'gradual decrease' : 'steady',
    explanation: s.metabolicSex === 'unspecified' ? 'A midpoint metabolic estimate has wider uncertainty. Your logged intake and weight trend can refine it.' : 'A starting estimate from your measurements, activity and recovery. Weight trajectories are approximate; review your trend over time.' };
}
export function applyStartingBudget(p: OnboardingProfile): OnboardingProfile {
  const b = startingBudget(p);
  return { ...p, goal: b.weeklyChangeLbs > 0 ? 'bulk' : b.weeklyChangeLbs < 0 ? 'cut' : 'maintain', dynamic_tdee_kcal: b.tdeeKcal,
    rest_targets: b.rest, training_targets: p.is_advanced_track ? b.training : null,
    preworkout_carbs_g: p.preworkout_fast_carbs ? Math.min(p.preworkout_carbs_g || 30, b.training.carbsG) : 0 };
}
