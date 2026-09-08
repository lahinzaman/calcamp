import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Action, Choice, NumericField } from '../../components/FormControls';
import { useOnboardingStore } from '../../store/onboardingStore';
import { authStore, useAuthStore } from '../../store/authStore';
import { completeOnboarding } from '../../api/profile';
import { ACTIVITY_LEVELS, DEFAULT_UPPER_LOWER, GOALS, validateOnboarding } from '../../types/profile';
import { emptyMacros, type MacroTotals } from '../../types/nutrition';

export type OnboardingStep = 'track' | 'basics' | 'advanced' | 'review';
const labels: Record<keyof MacroTotals, string> = { caloriesKcal: 'Calories (kcal)', proteinG: 'Protein (g)', carbsG: 'Carbohydrates (g)', fatG: 'Fat (g)' };
function TargetFields({ title, value, onChange }: { title: string; value: MacroTotals | null; onChange: (value: MacroTotals | null) => void }) {
  return <View className="my-4 rounded-2xl bg-zinc-100 p-4"><Text className="mb-3 text-lg font-bold text-zinc-900">{title}</Text>
    <Text className="mb-3 text-zinc-600">Optional personal targets. Enable to enter all four values.</Text>
    <Switch accessibilityLabel={`Enable ${title}`} value={!!value} onValueChange={enabled => onChange(enabled ? emptyMacros() : null)} />
    {value && (Object.keys(labels) as (keyof MacroTotals)[]).map(key => <NumericField key={key} label={`${title}: ${labels[key]}`} keyboardType="decimal-pad" value={value[key]} onValue={amount => onChange({ ...value, [key]: amount ?? 0 })} />)}
  </View>;
}
export default function OnboardingFlow({ step = 'track' }: { step?: OnboardingStep }) {
  const { draft, patch, reset } = useOnboardingStore();
  const session = useAuthStore(s => s.session); const pendingEmail = useAuthStore(s => s.pendingSignupEmail);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const save = async () => {
    setError(null); if (!session || busy) return;
    setBusy(true);
    try {
      const input = { ...draft, ...(!draft.is_advanced_track ? { training_days: [], training_targets: null, preworkout_fast_carbs: false, preworkout_carbs_g: 0 } : {}) };
      validateOnboarding(input);
      const profile = await completeOnboarding(input);
      authStore.getState().setProfile(profile); reset();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your profile.'); }
    finally { setBusy(false); }
  };
  return <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24, paddingBottom: 60, maxWidth: 760, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
    <Text className="mb-2 text-sm font-bold uppercase tracking-widest text-red-700">Your RULocked routine</Text>
    <Text className="mb-6 text-3xl font-bold text-zinc-950">{{ track: 'Choose your track', basics: 'Start with the basics', advanced: 'Fine-tune your training', review: 'Make it yours' }[step]}</Text>
    {!!pendingEmail && !session && <View className="mb-5 rounded-xl bg-amber-50 p-4"><Text className="text-amber-900">Check {pendingEmail} for a confirmation link if required. You can prepare your profile here; confirm your email and sign in to save it.</Text><Action secondary label="Return to sign in" onPress={() => { authStore.getState().setPendingSignup(null); router.replace('/auth'); }} /></View>}
    {step === 'track' && <>
      <Choice label="Casual · simple daily tracking" selected={!draft.is_advanced_track} onPress={() => patch({ is_advanced_track: false, preworkout_fast_carbs: false })} />
      <Choice label="Advanced · training days and nutrient timing" selected={draft.is_advanced_track} onPress={() => patch({ is_advanced_track: true })} />
      <Action label="Continue" onPress={() => router.push('/onboarding/basics')} />
    </>}
    {step === 'basics' && <>
      <NumericField label="Height (cm)" keyboardType="decimal-pad" value={draft.height_cm} onValue={height_cm => patch({ height_cm })} />
      <NumericField label="Weight (kg)" keyboardType="decimal-pad" value={draft.weight_kg} onValue={weight_kg => patch({ weight_kg })} />
      <Text className="mb-2 text-lg font-semibold text-zinc-900">Activity level</Text><View className="flex-row flex-wrap">{ACTIVITY_LEVELS.map(level => <Choice key={level} label={level} selected={draft.activity_level === level} onPress={() => patch({ activity_level: level })} />)}</View>
      <Text className="mb-2 mt-4 text-lg font-semibold text-zinc-900">Goal</Text><View className="flex-row flex-wrap">{GOALS.map(goal => <Choice key={goal} label={goal} selected={draft.goal === goal} onPress={() => patch({ goal })} />)}</View>
      <Action label="Continue" onPress={() => router.push(draft.is_advanced_track ? '/onboarding/advanced' : '/onboarding/review')} />
    </>}
    {step === 'advanced' && <>
      <Text className="mb-3 text-xl font-semibold text-zinc-900">4-day Upper / Lower</Text>
      {DEFAULT_UPPER_LOWER.map((day, i) => <Text key={day.name} className="mb-2 text-zinc-700">Session {i + 1}: {day.name} · {day.focus}</Text>)}
      <Text className="mb-2 mt-4 text-zinc-600">Select four days. Sessions follow the selected days in Monday-to-Sunday order.</Text>
      <View className="flex-row flex-wrap">{[1, 2, 3, 4, 5, 6, 0].map(day => <Choice key={day} label={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]} selected={draft.training_days.includes(day)} onPress={() => patch({ training_days: draft.training_days.includes(day) ? draft.training_days.filter(d => d !== day) : [...draft.training_days, day] })} />)}</View>
      <TargetFields title="Training-day targets" value={draft.training_targets} onChange={training_targets => patch({ training_targets })} />
      <View className="my-3 flex-row items-center justify-between gap-3"><Text className="flex-1 font-semibold text-zinc-900">Allocate fast-digesting pre-workout carbs</Text><Switch accessibilityLabel="Allocate fast-digesting pre-workout carbs" value={draft.preworkout_fast_carbs} onValueChange={preworkout_fast_carbs => patch({ preworkout_fast_carbs })} /></View>
      {draft.preworkout_fast_carbs && <><Text className="mb-4 text-zinc-600">This allocation is part of your daily carbohydrate target. Choose a food you tolerate before training.</Text><NumericField label="Pre-workout carbohydrates (g)" keyboardType="decimal-pad" value={draft.preworkout_carbs_g} onValue={value => patch({ preworkout_carbs_g: value ?? 0 })} /><NumericField label="Minutes before workout" keyboardType="number-pad" value={draft.preworkout_minutes} onValue={value => patch({ preworkout_minutes: value ?? 0 })} /></>}
      <Action label="Review targets" onPress={() => router.push('/onboarding/review')} />
    </>}
    {step === 'review' && <>
      <Text className="text-lg text-zinc-700">{draft.is_advanced_track ? 'Advanced · Upper / Lower' : 'Casual'} · {draft.goal}</Text>
      <Text className="mt-2 text-zinc-600">{draft.height_cm ?? '—'} cm · {draft.weight_kg ?? '—'} kg · {draft.activity_level}</Text>
      <TargetFields title={draft.is_advanced_track ? 'Rest-day targets' : 'Daily targets'} value={draft.rest_targets} onChange={rest_targets => patch({ rest_targets })} />
      <Text className="mb-5 text-zinc-600">Targets are optional. Macro rescue becomes available after you set a calorie and macro budget.</Text>
      {error && <Text accessibilityRole="alert" className="mb-4 text-red-700">{error}</Text>}
      <Action label={busy ? 'Saving…' : 'Save profile & enter RULocked'} disabled={!session || busy} onPress={() => void save()} />
    </>}
  </ScrollView>;
}
