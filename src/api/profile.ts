import { durableStorage } from '../modules/sync/storage';
import { useSyncStatus } from '../store/syncStore';
import { getSupabase } from './supabase';
import { validateOnboarding, type OnboardingProfile, type UserProfile } from '../types/profile';
const columns = 'id,height_cm,weight_kg,is_advanced_track,activity_level,goal,training_days,training_targets,rest_targets,preworkout_fast_carbs,preworkout_carbs_g,preworkout_minutes,onboarding_completed_at';
export async function loadProfile(userId: string): Promise<UserProfile | null> {
  let cached: UserProfile | null = null;
  try {
    const raw = durableStorage.get(`profile:${userId}`); const value = raw ? JSON.parse(raw) : null;
    if (value?.id === userId && Array.isArray(value.training_days) && typeof value.is_advanced_track === 'boolean') cached = value;
  } catch { /* A cache failure can still recover from an authoritative online read. */ }
  if (!useSyncStatus.getState().online && cached) return cached;
  const { data, error } = await getSupabase().from('users').select(columns).eq('id', userId).maybeSingle();
  if (error) { if (cached && (!error.code || /fetch|network|timeout/i.test(error.message))) return cached; throw new Error('Your profile could not be loaded. Try again when connected.'); }
  if (data) durableStorage.set(`profile:${userId}`, JSON.stringify(data)); else durableStorage.remove(`profile:${userId}`);
  return data as UserProfile | null;
}
export async function completeOnboarding(input: OnboardingProfile): Promise<UserProfile> {
  validateOnboarding(input);
  const client = getSupabase(); const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error('Confirm your email and sign in before saving your profile.');
  const { data, error } = await client.from('users').upsert({ ...input, id: auth.user.id,
    onboarding_completed_at: new Date().toISOString() }, { onConflict: 'id' }).select(columns).single();
  if (error) throw new Error('Your profile could not be saved. Check your connection and try again.');
  durableStorage.set(`profile:${auth.user.id}`, JSON.stringify(data));
  return data as UserProfile;
}
