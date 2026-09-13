import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Action } from '../../components/FormControls';
import { Reveal } from '../../theme/motion';
import { haptic } from '../../theme/haptics';
import { useOnboardingStore } from '../../store/onboardingStore';
import { authStore, useAuthStore } from '../../store/authStore';
import { completeOnboarding } from '../../api/profile';
import { heightLabel } from '../../lib/units';
import { applyStartingBudget, defaultSurvey, startingBudget } from './budget';
import { PermissionsCard } from './PermissionsCard';
import type { MacroTotals } from '../../types/nutrition';
function Plan({ label, macros, note }: { label: string; macros: MacroTotals; note?: string }) {
  return <View className="mb-3 rounded-3xl border border-border bg-surface p-5">
    <Text className="text-sm font-bold tracking-widest">{label.toUpperCase()}</Text>
    <Text className="my-2 text-4xl font-bold">{macros.caloriesKcal} kcal</Text>
    <Text>Protein {macros.proteinG} g · Carbs {Math.round(macros.carbsG)} g · Fat {macros.fatG} g</Text>
    {note && <Text className="mt-2 text-sm">{note}</Text>}
  </View>;
}
export default function ReviewScreen() {
  const { draft, reset } = useOnboardingStore();
  const session = useAuthStore(s => s.session);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const survey = { ...defaultSurvey, ...(draft.lifestyle_survey ?? {}) };
  let budget: ReturnType<typeof startingBudget> | null = null; let budgetError = '';
  try { budget = startingBudget(draft); } catch (cause) { budgetError = (cause as Error).message; }
  const save = async () => {
    if (!session || busy) return; setBusy(true); setError(null);
    try {
      const input = survey.specializedNutrition
        ? { ...draft, goal: 'maintain' as const, dynamic_tdee_kcal: null, rest_targets: null, training_targets: null, preworkout_fast_carbs: false, preworkout_carbs_g: 0 }
        : applyStartingBudget(draft);
      const profile = await completeOnboarding({ ...input, ...(!draft.is_advanced_track ? { training_days: [], training_targets: null, preworkout_fast_carbs: false, preworkout_carbs_g: 0 } : {}) });
      authStore.getState().setProfile(profile); reset(); haptic('success');
    } catch { setError('Could not save your profile. Check your answers and connection, then retry.'); haptic('error'); }
    finally { setBusy(false); }
  };
  return <SafeAreaView edges={['left','right','bottom']} className="flex-1 bg-background">
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <Reveal index={0}>
        <Text className="text-sm font-bold tracking-widest">YOUR STARTING PLAN</Text>
        <Text className="mb-2 mt-2 text-4xl font-bold">{budget ? `${budget.direction === 'steady' ? 'Holding steady' : budget.direction === 'gradual decrease' ? 'Losing' : 'Gaining'}` : 'Almost there'}</Text>
        <Text className="mb-5">{draft.height_inches ? heightLabel(draft.height_inches) : '—'} · {draft.weight_lbs ?? '—'} lbs{budget && budget.weeklyChangeLbs !== 0 ? ` · about ${Math.abs(budget.weeklyChangeLbs).toFixed(2)} lbs a week` : ''}</Text>
      </Reveal>
      {budget ? <>
        <Reveal index={1}>
          {budget.limitedBy && <View className="mb-4 rounded-2xl bg-raised p-4"><Text className="font-bold">We adjusted this</Text><Text className="mt-1 text-sm">{budget.limitedBy}</Text></View>}
          {budget.weeksToGoal !== null && <View className="mb-4 rounded-2xl bg-raised p-4"><Text className="font-bold">About {budget.weeksToGoal} weeks to your goal weight</Text><Text className="mt-1 text-sm">An estimate at today's rate. It will move as your real data comes in.</Text></View>}
        </Reveal>
        <Reveal index={2}>
          {draft.is_advanced_track
            ? <><Plan label="Training days" macros={budget.training} note="Four training days and three rest days, holding the same weekly energy." /><Plan label="Rest days" macros={budget.rest} /></>
            : <Plan label="Every day" macros={budget.rest} />}
          <Text className="mb-2 text-sm">Estimated daily expenditure {budget.tdeeKcal} kcal · resting {Math.round(budget.restingKcal)} kcal.</Text>
          <Text className="mb-5 text-sm">{budget.explanation}</Text>
        </Reveal>
      </> : <Reveal index={1}><View className="mb-5 rounded-3xl bg-surface p-5"><Text className="font-bold">No calorie target</Text><Text className="mt-2">{budgetError}</Text><Text className="mt-2 text-sm">You can still log food, training and weight — everything works without a target.</Text></View></Reveal>}
      <Reveal index={2}><PermissionsCard /></Reveal>
      {error && <Text accessibilityRole="alert" className="mb-4">{error}</Text>}
      {!session && <Text className="mb-4 rounded-xl bg-raised p-4">Sign in to save this plan. Your answers are kept on this device meanwhile.</Text>}
      <Action label={busy ? 'Saving…' : 'Start using CalCamp'} disabled={!session || busy} onPress={() => void save()} tone="success" />
      <Action secondary label="Change my answers" onPress={() => router.replace('/onboarding')} />
    </ScrollView>
  </SafeAreaView>;
}
