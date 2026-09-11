import { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Action, Choice, NumericField } from '../../components/FormControls';
import { ProgressBar } from '../../theme/motion';
import { useOnboardingStore } from '../../store/onboardingStore';
import { authStore, useAuthStore } from '../../store/authStore';
import { completeOnboarding } from '../../api/profile';
import { ACTIVITY_LEVELS, DEFAULT_UPPER_LOWER } from '../../types/profile';
import { heightInches, heightLabel } from '../../lib/units';
import { applyStartingBudget, defaultSurvey, startingBudget, type LifestyleSurvey } from './budget';
export type OnboardingStep = 'track' | 'basics' | 'advanced' | 'review';
export default function OnboardingFlow({ step = 'track' }: { step?: OnboardingStep }) {
  const { draft, patch, reset } = useOnboardingStore(); const session = useAuthStore(s => s.session);
  const pendingEmail = useAuthStore(s => s.pendingSignupEmail);
  const [feet, setFeet] = useState<number | null>(draft.height_inches ? Math.floor(draft.height_inches / 12) : null);
  const [inches, setInches] = useState<number | null>(draft.height_inches ? draft.height_inches % 12 : 0);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const survey = draft.lifestyle_survey ?? defaultSurvey;
  const totalSteps = draft.is_advanced_track ? 4 : 3;
  const stepNumber = { track: 1, basics: 2, advanced: 3, review: totalSteps }[step];
  const updateSurvey = (value: Partial<LifestyleSurvey>) => patch({ lifestyle_survey: { ...survey, ...value } });
  let budget: ReturnType<typeof startingBudget> | null = null; let budgetError = '';
  try { budget = startingBudget(draft); } catch (e) { budgetError = (e as Error).message; }
  const advance = () => {
    try {
      const next = { ...draft, lifestyle_survey: {...survey,skipAutomaticBudget:false}, height_inches: heightInches(feet!, inches!) }; const calculated = applyStartingBudget(next);
      patch(calculated); setError(null); router.push(draft.is_advanced_track ? '/onboarding/advanced' : '/onboarding/review');
    } catch (e) { setError((e as Error).message); }
  };
  const save = async () => {
    if (!session || busy) return; setBusy(true); setError(null);
    try {
      const input = survey.skipAutomaticBudget ? {...draft,goal:'maintain' as const,dynamic_tdee_kcal:null,rest_targets:null,training_targets:null,preworkout_fast_carbs:false,preworkout_carbs_g:0} : applyStartingBudget(draft);
      const profile = await completeOnboarding({ ...input, ...(!draft.is_advanced_track ? { training_days: [], training_targets: null, preworkout_fast_carbs: false, preworkout_carbs_g: 0 } : {}) });
      authStore.getState().setProfile(profile); reset();
    } catch { setError('Could not save your profile. Check the survey and connection, then retry.'); } finally { setBusy(false); }
  };
  return <SafeAreaView edges={['left','right','bottom']} className="flex-1 bg-background"><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 80, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
    <Text className="mb-2 text-sm font-bold">YOUR CALCAMP ROUTINE</Text>
    <Text className="mb-2 text-3xl font-bold">{{ track: 'Your kind of progress', basics: 'A day in your life', advanced: 'Your training rhythm', review: 'Your starting budget' }[step]}</Text>
    <View className="mb-2"><ProgressBar value={stepNumber} target={totalSteps} tone="protein" height={6} /></View>
    <Text className="mb-5 text-sm">Step {stepNumber} of {totalSteps} · {{ track: 'How closely you want to track.', basics: 'These set your starting calorie budget.', advanced: 'Which days you train, so rest and training targets differ.', review: 'Check the numbers before you start.' }[step]}</Text>
    {!!pendingEmail && !session && <View className="mb-4"><Text>Confirm {pendingEmail}, then sign in to save. You can prepare this survey now.</Text><Action label="Return to sign in" onPress={() => { authStore.getState().setPendingSignup(null); router.replace('/auth'); }} /></View>}
    {step === 'track' && <><Choice label="Casual · everyday nutrition" selected={!draft.is_advanced_track} onPress={() => patch({ is_advanced_track: false })} /><Choice label="Advanced · structured training" selected={draft.is_advanced_track} onPress={() => patch({ is_advanced_track: true })} /><Action label="Continue" onPress={() => router.push('/onboarding/basics')} /></>}
    {step === 'basics' && <>
      <View className="flex-row gap-4"><View className="flex-1"><NumericField label="Height · feet" keyboardType="number-pad" value={feet} onValue={setFeet} /></View><View className="flex-1"><NumericField label="Height · inches" keyboardType="decimal-pad" value={inches} onValue={setInches} /></View></View>
      <NumericField label="Body weight · lbs" keyboardType="decimal-pad" value={draft.weight_lbs} onValue={weight_lbs => patch({ weight_lbs })} />
      <NumericField label="Age in years" keyboardType="number-pad" value={survey.age} onValue={age => updateSurvey({ age })} />
      <Text className="mb-2 font-bold">Metabolic equation reference</Text><Text className="mb-3">Optional physiological reference for the estimate, not gender identity.</Text><View className="flex-row flex-wrap">{(['female','male','unspecified'] as const).map(v => <Choice key={v} label={v === 'unspecified' ? 'Prefer not to say' : v} selected={survey.metabolicSex === v} onPress={() => updateSurvey({ metabolicSex: v })} />)}</View>
      <Text className="mt-1 text-sm">Height, weight and age feed the Mifflin–St Jeor equation. Nothing here is shared, and you can change it later.</Text>
      <Text className="my-3 font-bold">How active is your typical week?</Text>{ACTIVITY_LEVELS.map((v,i) => <Choice key={v} label={['Mostly seated','Some walking / 1–2 active days','Regular walking / 3–4 active days','Physical work / 5+ active days'][i]} selected={draft.activity_level === v} onPress={() => patch({ activity_level: v })} />)}
      <Text className="my-3 font-bold">How would you describe your build?</Text><View className="flex-row flex-wrap">{(['unsure','lean','balanced','higher'] as const).map(v => <Choice key={v} label={v === 'higher' ? 'More body fat' : v} selected={survey.composition === v} onPress={() => updateSurvey({ composition: v })} />)}</View>
      <Text className="my-3 font-bold">What would make daily life better?</Text>{(['energy','strength','mobility'] as const).map((v,i) => <Choice key={v} label={['Steadier energy','Feeling stronger','Moving more comfortably'][i]} selected={survey.priority === v} onPress={() => updateSurvey({ priority: v })} />)}
      <Text className="my-3 font-bold">How is your recovery?</Text><Choice label="Generally rested" selected={survey.recovery === 'steady'} onPress={() => updateSurvey({ recovery: 'steady' })} /><Choice label="Often tired or under-fueled" selected={survey.recovery === 'tired'} onPress={() => updateSurvey({ recovery: 'tired' })} />
      <View className="my-4 flex-row items-center gap-3"><Text className="flex-1">Pregnant, breastfeeding, or following clinician-managed nutrition</Text><Switch accessibilityLabel="Specialized nutrition needs" value={survey.specializedNutrition} onValueChange={specializedNutrition => updateSurvey({ specializedNutrition })} /></View>
      <Action label="Calculate my starting budget" onPress={advance} />
      {(survey.specializedNutrition || (survey.age !== null && survey.age < 18)) && <Action secondary label="Track without automatic targets" onPress={() => {try {patch({height_inches:heightInches(feet!,inches!),lifestyle_survey:{...survey,skipAutomaticBudget:true}});router.push('/onboarding/review');}catch(e){setError((e as Error).message);}}} />}
    </>}
    {step === 'advanced' && <>
      {DEFAULT_UPPER_LOWER.map(d => <Text key={d.name} className="mb-3 text-lg">{d.name} · {d.focus}</Text>)}
      <Text className="mb-3">Choose four days; sessions follow Monday-to-Sunday order.</Text><View className="flex-row flex-wrap">{[1,2,3,4,5,6,0].map(d => <Choice key={d} label={['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]} selected={draft.training_days.includes(d)} onPress={() => patch({ training_days: draft.training_days.includes(d) ? draft.training_days.filter(x => x !== d) : [...draft.training_days,d] })} />)}</View>
      <View className="my-4 flex-row items-center gap-3"><Text className="flex-1">Allocate fast-digesting pre-workout carbohydrates</Text><Switch accessibilityLabel="Pre-workout carbohydrate timing" value={draft.preworkout_fast_carbs} onValueChange={preworkout_fast_carbs => patch({ preworkout_fast_carbs, preworkout_carbs_g: 30 })} /></View>
      {draft.preworkout_fast_carbs && <><NumericField label="Pre-workout carbs · g" value={draft.preworkout_carbs_g} onValue={v => patch({ preworkout_carbs_g: v ?? 0 })} /><NumericField label="Minutes before workout" value={draft.preworkout_minutes} onValue={v => patch({ preworkout_minutes: v ?? 60 })} /></>}
      <Action label="Review targets" onPress={() => router.push('/onboarding/review')} />
    </>}
    {step === 'review' && <>
      <Text className="mb-4">{draft.height_inches ? heightLabel(draft.height_inches) : '—'} · {draft.weight_lbs} lbs</Text>
      {budget ? <><Text className="mb-4 text-xl font-bold">{budget.direction} · approximately {Math.abs(budget.weeklyChangeLbs).toFixed(2)} lbs/week</Text>{(draft.is_advanced_track ? [['Rest days',budget.rest],['Training days',budget.training]] as const : [['Daily budget',budget.rest]] as const).map(([label,m]) => <View key={label} className="mb-4 rounded-3xl bg-surface p-5"><Text className="font-bold">{label}</Text><Text className="my-3 text-3xl">{m.caloriesKcal} kcal</Text><Text>Protein {m.proteinG} g · Fats {m.fatG} g · Carbs {Math.round(m.carbsG)} g</Text></View>)}<Text className="mb-5">{budget.explanation}</Text></> : <Text>{budgetError}</Text>}
      <Action label={busy ? 'Saving…' : 'Accept budget & enter CalCamp'} disabled={!session || busy || (!budget && !survey.skipAutomaticBudget)} onPress={() => void save()} /><Action label="Review my answers" secondary onPress={() => router.push('/onboarding/basics')} />
    </>}
    {error && <Text accessibilityRole="alert" className="my-4">{error}</Text>}
  </ScrollView></SafeAreaView>;
}
