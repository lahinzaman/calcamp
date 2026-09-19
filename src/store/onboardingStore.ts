import { defaultSurvey } from '../modules/onboarding/budget';
import { create } from 'zustand';
import type { OnboardingProfile } from '../types/profile';
const defaults: OnboardingProfile = {
  lifestyle_survey: { ...defaultSurvey }, height_inches: null, weight_lbs: null, activity_level: 'moderate', goal: 'maintain',
  // No day is chosen for you. A pre-ticked Mon/Tue/Thu/Fri is a schedule the app invented, and
  // it is answered by tapping "Next" without reading — which is how someone ends up with rest-day
  // targets on days they actually train. The split question refuses to advance until at least
  // one day is picked, so an empty start asks the question rather than assuming the answer.
  is_advanced_track: false, training_days: [], training_targets: null, rest_targets: null,
  preworkout_fast_carbs: false, preworkout_carbs_g: 0, preworkout_minutes: 60,
};
export const useOnboardingStore = create<{ draft: OnboardingProfile; patch: (patch: Partial<OnboardingProfile>) => void; reset: () => void }>(set => ({
  draft: { ...defaults }, patch: patch => set(s => ({ draft: { ...s.draft, ...patch } })), reset: () => set({ draft: { ...defaults } }),
}));
