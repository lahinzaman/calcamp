import { useEffect, useRef } from 'react';
import { useNutritionStore } from '../../store/nutritionStore';
import { useAuthStore } from '../../store/authStore';
import { endDay, startDay, updateDay } from './LiveActivityService';

/**
 * Mirrors the day onto the lock screen. It follows the totals the diary already keeps rather
 * than being told when to update, so every way of logging — scanner, description, dining hall —
 * moves it without each having to remember to.
 */
export function useLiveActivity(enabled = true) {
  const consumed = useNutritionStore(state => state.consumedMacros);
  const targetKcal = useAuthStore(state => state.profile?.rest_targets?.caloriesKcal ?? null);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const progress = { consumed, targetKcal };
    // Nothing logged yet is not a day in progress; starting then would pin an empty ring.
    if (!started.current && consumed.caloriesKcal <= 0) return;
    if (!started.current) { started.current = true; void startDay(progress); return; }
    void updateDay(progress);
  }, [enabled, consumed, targetKcal]);

  useEffect(() => () => { if (started.current) { started.current = false; void endDay({ consumed, targetKcal }); } },
    // The activity should outlive a screen, so this only runs when the hook itself is torn down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
}
