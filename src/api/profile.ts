import { getSupabase } from './supabase';
import { validateOnboarding, type OnboardingProfile, type UserProfile } from '../types/profile';
const columns = 'id,height_cm,weight_kg,is_advanced_track,activity_level,goal,training_days,training_targets,rest_targets,preworkout_fast_carbs,preworkout_carbs_g,preworkout_minutes,onboarding_completed_at';
export async function loadProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await getSupabase().from('users').select(columns).eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as UserProfile | null;
}
export async function completeOnboarding(input: OnboardingProfile): Promise<UserProfile> {
  validateOnboarding(input);
  const client = getSupabase(); const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error('Confirm your email and sign in before saving your profile.');
  const { data, error } = await client.from('users').upsert({ ...input, id: auth.user.id,
    onboarding_completed_at: new Date().toISOString() }, { onConflict: 'id' }).select(columns).single();
  if (error) throw new Error(error.message);
  return data as UserProfile;
}
