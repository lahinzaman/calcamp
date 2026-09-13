import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Action, Choice, Field } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { useT, type MessageKey } from '../../i18n';
import { authStore, useAuthStore } from '../../store/authStore';
import { nutritionStore } from '../../store/nutritionStore';
import { updateGoal, updateTargets } from '../../api/profile';
import {
  GOAL_DIRECTIONS, RATE_CHOICES, defaultSurvey, startingBudget,
  type GoalDirection, type LifestyleSurvey,
} from '../onboarding/budget';

const DIRECTION_KEYS: Record<GoalDirection, MessageKey> = {
  auto: 'goal.auto', lose: 'goal.lose', maintain: 'goal.maintain', gain: 'goal.gain', recomp: 'goal.recomp',
};
const GOAL_FOR: Record<GoalDirection, 'cut' | 'maintain' | 'bulk'> = {
  auto: 'maintain', lose: 'cut', maintain: 'maintain', gain: 'bulk', recomp: 'maintain',
};

/** Change the goal, the weight behind it, and — as a separate, visible act — the budget. */
export function GoalEditor({ onClose }: { onClose: () => void }) {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const stored = { ...defaultSurvey, ...((profile?.lifestyle_survey ?? {}) as Partial<LifestyleSurvey>) };
  const [direction, setDirection] = useState<GoalDirection>(stored.goalDirection ?? 'auto');
  const [rate, setRate] = useState<number>(stored.rateLbsPerWeek ?? 1);
  const [goalWeight, setGoalWeight] = useState(stored.goalWeightLbs === null || stored.goalWeightLbs === undefined ? '' : String(stored.goalWeightLbs));
  const [weight, setWeight] = useState(profile?.weight_lbs === null || profile?.weight_lbs === undefined ? '' : String(Number(profile.weight_lbs.toFixed(1))));
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const survey: LifestyleSurvey = {
    ...stored, goalDirection: direction, rateLbsPerWeek: rate,
    goalWeightLbs: goalWeight.trim() ? Number(goalWeight) : null,
  };
  const draft = profile ? { ...profile, weight_lbs: weight.trim() ? Number(weight) : profile.weight_lbs, lifestyle_survey: survey } : null;
  const preview = useMemo(() => {
    if (!draft) return null;
    try { return startingBudget(draft as Parameters<typeof startingBudget>[0]); } catch { return null; }
  }, [draft]);

  const save = async (alsoTargets: boolean) => {
    if (!profile || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const pounds = weight.trim() ? Number(weight) : profile.weight_lbs;
      if (pounds === null || !Number.isFinite(pounds)) throw new Error('Enter your current weight.');
      let saved = await updateGoal({ weight_lbs: pounds, goal: GOAL_FOR[direction], lifestyle_survey: survey as unknown as Record<string, unknown> });
      if (alsoTargets) {
        if (!preview) throw new Error('Your answers do not add up to a budget yet. Retake the quiz to fill in the gaps.');
        saved = await updateTargets({ rest_targets: preview.rest, training_targets: profile.is_advanced_track ? preview.training : null, dynamic_tdee_kcal: preview.tdeeKcal });
        nutritionStore.getState().setDailyTargets({ macros: preview.rest, micronutrients: {} });
      }
      authStore.getState().setProfile(saved);
      nutritionStore.getState().setBodyWeightLbs(pounds);
      haptic('success');
      setNotice(alsoTargets ? 'Goal and targets updated.' : 'Goal updated. Your calorie targets are unchanged.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'That could not be saved.'); haptic('error'); }
    finally { setBusy(false); }
  };

  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text className="text-sm font-bold tracking-widest">{t('goal.eyebrow')}</Text>
        <Text className="mb-5 mt-2 text-3xl font-bold">{t('goal.title')}</Text>

        <Field label="Current weight · lbs" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />

        <Text className="mb-2 font-bold">{t('goal.direction')}</Text>
        <View className="mb-4 flex-row flex-wrap">{GOAL_DIRECTIONS.map(value => <Choice key={value} label={t(DIRECTION_KEYS[value])}
          selected={direction === value} onPress={() => { setDirection(value); haptic('selection'); }} />)}</View>

        {(direction === 'lose' || direction === 'gain') && <>
          <Text className="mb-2 font-bold">{t('goal.howFast')}</Text>
          <View className="mb-4 flex-row flex-wrap">{RATE_CHOICES.map(value => <Choice key={value} label={`${value} lb / week`}
            selected={rate === value} onPress={() => { setRate(value); haptic('selection'); }} />)}</View>
        </>}

        <Field label="Goal weight · lbs (optional)" value={goalWeight} onChangeText={setGoalWeight} keyboardType="decimal-pad" />

        {preview && <View className="mb-5 rounded-3xl border border-border bg-surface p-5">
          <Text className="text-sm font-bold tracking-widest">{t('goal.ifRecalculate')}</Text>
          <Text className="my-2 text-4xl font-bold">{preview.rest.caloriesKcal} kcal</Text>
          <Text>Protein {preview.rest.proteinG} g · Carbs {Math.round(preview.rest.carbsG)} g · Fat {preview.rest.fatG} g</Text>
          <Text className="mt-2 text-sm">{preview.explanation}</Text>
        </View>}

        {error && <Text accessibilityRole="alert" className="mb-4">{error}</Text>}
        {notice && <Text className="mb-4">{notice}</Text>}

        <Action label={busy ? t('common.saving') : t('goal.saveAndRecalculate')} disabled={busy || !preview} onPress={() => void save(true)} tone="success" />
        <Action secondary label={t('goal.saveOnly')} disabled={busy} onPress={() => void save(false)} />
        <Action secondary label={t('goal.retakeQuiz')} disabled={busy} onPress={() => { onClose(); void import('expo-router').then(({ router }) => router.push('/onboarding')); }} />
        <Action secondary label={t('common.close')} onPress={onClose} />
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
