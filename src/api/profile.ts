import { kgToLbs, lbsToKg, cmToInches, inchesToCm } from '../lib/units';
import { durableStorage } from '../modules/sync/storage';
import { useSyncStatus } from '../store/syncStore';
import { getSupabase } from './supabase';
import { validateOnboarding, type OnboardingProfile, type UserProfile } from '../types/profile';
import type { MacroTotals } from '../types/nutrition';
const columns = 'id,height_cm,weight_kg,is_advanced_track,activity_level,goal,training_days,training_targets,rest_targets,preworkout_fast_carbs,preworkout_carbs_g,preworkout_minutes,onboarding_completed_at,lifestyle_survey,dynamic_tdee_kcal';
export async function loadProfile(userId: string): Promise<UserProfile | null> {
  let cached: UserProfile | null = null;
  try {
    const raw = durableStorage.get(`profile:${userId}`); const value = raw ? JSON.parse(raw) : null;
    if (value?.id === userId && Array.isArray(value.training_days) && typeof value.is_advanced_track === 'boolean') cached = 'weight_lbs' in value ? value : fromDatabase(value);
  } catch { /* A cache failure can still recover from an authoritative online read. */ }
  if (!useSyncStatus.getState().online && cached) return cached;
  const { data, error } = await getSupabase().from('users').select(columns).eq('id', userId).maybeSingle();
  if (error) { if (cached && (!error.code || /fetch|network|timeout/i.test(error.message))) return cached; throw new Error('Your profile could not be loaded. Try again when connected.'); }
  if (data) durableStorage.set(`profile:${userId}`, JSON.stringify(data)); else durableStorage.remove(`profile:${userId}`);
  return data ? fromDatabase(data) : null;
}
/**
 * A rejected save is almost never a connection problem, and saying so sends people to retry
 * something that will fail identically. The database names what it objected to; this says it
 * back in words, and keeps the raw message when it is something not seen before.
 */
export function saveProblem(error: { message?: string; code?: string; details?: string; hint?: string }): string {
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  if (text.includes('onboarding_profile_complete')) {
    return 'The server rejected your training schedule. Its database is a version behind this app — apply the latest Supabase migration, then retry.';
  }
  if (text.includes('training_days_valid')) return 'Choose between one and seven different training days.';
  if (text.includes('preworkout_allocation_valid')) return 'Your pre-workout carbohydrates do not fit inside your training-day carb target.';
  if (error.code === '23503') return 'This account is not fully signed up yet. Confirm your email address, sign in again, then retry.';
  if (error.code === '42501' || error.code === 'PGRST301') return 'This session is not allowed to save a profile. Sign out and back in, then retry.';
  if (error.code === '23514') return `One of your answers is outside what the server accepts${error.message ? `: ${error.message}` : '.'}`;
  return `Your profile could not be saved${error.message ? `: ${error.message}` : '.'} Check your connection and try again.`;
}

export async function completeOnboarding(input: OnboardingProfile): Promise<UserProfile> {
  validateOnboarding(input);
  const client = getSupabase(); const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error('Sign in before saving your profile.');
  const { height_inches, weight_lbs, ...rest } = input;
  const { data, error } = await client.from('users').upsert({ ...rest, height_cm: inchesToCm(height_inches!), weight_kg: lbsToKg(weight_lbs!), id: auth.user.id,
    onboarding_completed_at: new Date().toISOString() }, { onConflict: 'id' }).select(columns).single();
  if (error) throw new Error(saveProblem(error));
  durableStorage.set(`profile:${auth.user.id}`, JSON.stringify(data));
  return fromDatabase(data);
}

/**
 * Your goal, your current weight and the answers behind them stay editable after onboarding.
 * Targets are left alone here: changing a goal and recalculating a budget are separate acts,
 * and doing both silently would move someone's calories without telling them.
 */
export async function updateGoal(input: { weight_lbs: number; goal: UserProfile['goal']; lifestyle_survey: Record<string, unknown> }): Promise<UserProfile> {
  if (!Number.isFinite(input.weight_lbs) || input.weight_lbs < 70 || input.weight_lbs > 700) throw new Error('Enter a body weight of 70–700 lbs.');
  const client = getSupabase(); const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error('Sign in before changing your goal.');
  const { data, error } = await client.from('users')
    .update({ weight_kg: lbsToKg(input.weight_lbs), goal: input.goal, lifestyle_survey: input.lifestyle_survey })
    .eq('id', auth.user.id).select(columns).single();
  if (error) throw new Error('Your goal could not be saved. Check your connection and try again.');
  durableStorage.set(`profile:${auth.user.id}`, JSON.stringify(data));
  return fromDatabase(data);
}

/** Targets stay editable after onboarding; nothing else about the profile is touched. */
export async function updateTargets(input: { rest_targets: MacroTotals; training_targets: MacroTotals | null; dynamic_tdee_kcal?: number | null }): Promise<UserProfile> {
  for (const target of [input.rest_targets, input.training_targets]) {
    if (target && (Object.keys(target).length !== 4 || (['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const).some(key => !Number.isFinite(target[key]) || target[key] < 0 || target[key] > 20000) || target.caloriesKcal <= 0)) {
      throw new Error('Enter a calorie target above 0 and macro amounts between 0 and 20000 g.');
    }
  }
  const client = getSupabase(); const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error('Sign in before changing your targets.');
  const patch: Record<string, unknown> = { rest_targets: input.rest_targets, training_targets: input.training_targets };
  if (input.dynamic_tdee_kcal !== undefined) patch.dynamic_tdee_kcal = input.dynamic_tdee_kcal;
  const { data, error } = await client.from('users').update(patch).eq('id', auth.user.id).select(columns).single();
  if (error) throw new Error('Your targets could not be saved. Check your connection and try again.');
  durableStorage.set(`profile:${auth.user.id}`, JSON.stringify(data));
  return fromDatabase(data);
}

function fromDatabase(row: Record<string, any>): UserProfile {
  const { height_cm, weight_kg, ...rest } = row;
  return { ...rest, height_inches: height_cm === null ? null : cmToInches(Number(height_cm)), weight_lbs: weight_kg === null ? null : kgToLbs(Number(weight_kg)) } as UserProfile;
}
