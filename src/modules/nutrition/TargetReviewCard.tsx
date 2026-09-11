import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text } from '../../theme/primitives';
import { Action } from '../../components/FormControls';
import { Reveal } from '../../theme/motion';
import { haptic } from '../../theme/haptics';
import { authStore, useAuthStore } from '../../store/authStore';
import { nutritionStore, localDateKey } from '../../store/nutritionStore';
import { loadHistory, shiftDate } from '../../api/history';
import { updateTargets } from '../../api/profile';
import { calculateTdee } from './tdee';
import { daysUntilReview, isReviewDue, nextTarget } from './adaptive';
import { calorieFloor, intendedWeeklyChange } from '../onboarding/budget';
import { readLastReview, rescale, writeLastReview } from './targetReview';
export function TargetReviewCard({ index = 2 }: { index?: number }) {
  const owner = useAuthStore(s => s.session?.user.id);
  const profile = useAuthStore(s => s.profile);
  const queries = useQueryClient();
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null);
  const [reviewedAt, setReviewedAt] = useState(() => (owner ? readLastReview(owner) : null));
  const today = localDateKey(new Date());
  const history = useQuery({ enabled: !!owner, queryKey: ['history', owner, 60, today],
    queryFn: () => loadHistory(owner!, shiftDate(today, -59), today), staleTime: 300000 });
  const current = profile?.rest_targets ?? null;
  if (!profile || !current || history.isPending || history.isError) return null;
  const estimate = calculateTdee(history.data ?? [], { windowDays: 28, asOfDate: today });
  const adjustment = nextTarget({ currentTargetKcal: current.caloriesKcal, intendedWeeklyChangeLbs: intendedWeeklyChange(profile.lifestyle_survey),
    estimate, floorKcal: calorieFloor(profile.lifestyle_survey) });
  const due = isReviewDue(reviewedAt);
  if (adjustment.status === 'measuring' || (adjustment.status === 'on-track' && !due)) return null;
  const apply = async () => {
    if (busy) return; setBusy(true); setNotice(null);
    try {
      const rest = rescale(current, adjustment.nextTargetKcal);
      const training = profile.training_targets ? rescale(profile.training_targets, adjustment.nextTargetKcal + 90) : null;
      const next = await updateTargets({ rest_targets: rest, training_targets: training, dynamic_tdee_kcal: adjustment.measuredTdeeKcal });
      authStore.getState().setProfile(next);
      nutritionStore.getState().setDailyTargets({ macros: rest, micronutrients: {} });
      markReviewed(); await queries.invalidateQueries({ queryKey: ['history'] });
      setNotice(`Your target is now ${adjustment.nextTargetKcal} kcal.`); haptic('success');
    } catch { setNotice('That change could not be saved. Try again when connected.'); haptic('error'); }
    finally { setBusy(false); }
  };
  const markReviewed = () => { const now = Date.now(); if (owner) writeLastReview(owner, now); setReviewedAt(now); };
  return <Reveal index={index}><View className="mb-5 rounded-3xl border border-border bg-surface p-5">
    <Text className="text-sm font-bold tracking-widest">WEEKLY CHECK-IN</Text>
    {adjustment.status === 'on-track' ? <>
      <Text className="my-2 text-xl font-bold">Your plan is working</Text>
      <Text className="mb-4">{adjustment.reason}</Text>
      <Action secondary label="Got it" onPress={() => { markReviewed(); haptic('light'); }} />
    </> : <>
      <Text className="my-2 text-3xl font-bold">{adjustment.deltaKcal > 0 ? '+' : ''}{adjustment.deltaKcal} kcal a day</Text>
      <Text className="mb-4">{adjustment.reason}</Text>
      <Text className="mb-4 text-sm">This uses your measured expenditure over the last four weeks, not the estimate from your survey. Change is capped so one unusual fortnight cannot swing your budget.</Text>
      {notice && <Text accessibilityLiveRegion="polite" className="mb-3">{notice}</Text>}
      <Action label={busy ? 'Updating…' : `Update to ${adjustment.nextTargetKcal} kcal`} disabled={busy} onPress={() => void apply()} tone="success" />
      <Action secondary label="Keep my current target" onPress={() => { markReviewed(); haptic('light'); }} />
      {!due && <Text className="mt-1 text-sm">Next review in {daysUntilReview(reviewedAt)} day(s).</Text>}
    </>}
  </View></Reveal>;
}
