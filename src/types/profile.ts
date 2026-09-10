import type { LifestyleSurvey } from '../modules/onboarding/budget';
import type { MacroTotals } from './nutrition';
export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'high'] as const;
export const GOALS = ['cut', 'bulk', 'maintain'] as const;
export interface UserProfile {
  id: string;
  lifestyle_survey?: LifestyleSurvey;
  dynamic_tdee_kcal?: number | null;
  height_inches: number | null;
  weight_lbs: number | null;
  is_advanced_track: boolean;
  activity_level: typeof ACTIVITY_LEVELS[number] | null;
  goal: typeof GOALS[number] | null;
  training_days: number[];
  training_targets: MacroTotals | null;
  rest_targets: MacroTotals | null;
  preworkout_fast_carbs: boolean;
  preworkout_carbs_g: number;
  preworkout_minutes: number;
  onboarding_completed_at: string | null;
}
export type OnboardingProfile = Omit<UserProfile, 'id' | 'onboarding_completed_at'>;
export const DEFAULT_UPPER_LOWER = [
  { day: 1, name: 'Upper A', focus: 'Horizontal push / pull' },
  { day: 2, name: 'Lower A', focus: 'Squat emphasis' },
  { day: 4, name: 'Upper B', focus: 'Vertical push / pull' },
  { day: 5, name: 'Lower B', focus: 'Hinge emphasis' },
] as const;
export function validateOnboarding(profile: OnboardingProfile) {
  if (!Number.isFinite(profile.height_inches) || profile.height_inches! < 12 || profile.height_inches! > 118
    || !Number.isFinite(profile.weight_lbs) || profile.weight_lbs! < 2 || profile.weight_lbs! > 2204) throw new Error('Enter height in feet/inches and weight in lbs.');
  if (!ACTIVITY_LEVELS.includes(profile.activity_level!) || !GOALS.includes(profile.goal!)) throw new Error('Choose an activity level and goal.');
  if (profile.is_advanced_track && (profile.training_days.length !== 4 || new Set(profile.training_days).size !== 4
    || profile.training_days.some(day => !Number.isInteger(day) || day < 0 || day > 6))) throw new Error('Choose four distinct training days.');
  for (const target of [profile.training_targets, profile.rest_targets]) {
    if (target && (Object.keys(target).length !== 4 || (['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const).some(key => !Number.isFinite(target[key]) || target[key] < 0 || target[key] > 20000) || target.caloriesKcal <= 0)) throw new Error('Enter valid daily targets or leave every target field blank.');
  }
  if (profile.preworkout_fast_carbs && (!profile.is_advanced_track || !profile.training_targets
    || !Number.isFinite(profile.preworkout_carbs_g) || profile.preworkout_carbs_g <= 0
    || profile.preworkout_carbs_g > Math.min(300, profile.training_targets.carbsG))) throw new Error('Pre-workout carbs must fit within your training-day carbohydrate target.');
  if (!Number.isInteger(profile.preworkout_minutes) || profile.preworkout_minutes < 15 || profile.preworkout_minutes > 180) throw new Error('Pre-workout window must be 15–180 minutes.');
}
