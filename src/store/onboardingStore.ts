import { defaultSurvey } from '../modules/onboarding/budget';
import { create } from 'zustand';
import type { OnboardingProfile } from '../types/profile';
const defaults: OnboardingProfile = {
  lifestyle_survey: { ...defaultSurvey }, height_inches: null, weight_lbs: null, activity_level: 'moderate', goal: 'maintain',
  is_advanced_track: false, training_days: [1, 2, 4, 5], training_targets: null, rest_targets: null,
  preworkout_fast_carbs: false, preworkout_carbs_g: 0, preworkout_minutes: 60,
};
export const useOnboardingStore = create<{ draft: OnboardingProfile; patch: (patch: Partial<OnboardingProfile>) => void; reset: () => void }>(set => ({
  draft: { ...defaults }, patch: patch => set(s => ({ draft: { ...s.draft, ...patch } })), reset: () => set({ draft: { ...defaults } }),
}));
