import { safelyEdit } from '../safelyEdit';
import { CloudSyncLifecycle } from './CloudSyncLifecycle';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';

import { nutritionStore } from '../../store/nutritionStore';
import { getRemainingRestSeconds, useWorkoutStore, workoutStore } from '../../store/workoutStore';
import { startRestTicker } from '../../modules/workout/restTimerDriver';

const RestCountdownContext = createContext(0);
export const useRestCountdown = () => useContext(RestCountdownContext);

export function TrackingProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: {
    queries: { staleTime: 5 * 60_000, retry: 1 },
  } }));
  const timer = useWorkoutStore((state) => state.restTimer);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const foreground = () => {
      safelyEdit(() => nutritionStore.getState().syncToday());
      safelyEdit(() => workoutStore.getState().clearExpiredRestTimer());
      setNow(Date.now());
    };
    foreground();
    const subscription = AppState.addEventListener('change', (state) => {
      if (Platform.OS !== 'web') focusManager.setFocused(state === 'active');
      if (state === 'active') foreground();
    });
    return () => { subscription.remove(); if (Platform.OS !== 'web') focusManager.setFocused(undefined); };
  }, []);

  useEffect(() => {
    if (!timer) return;
    const tick = () => {
      const timestamp = Date.now();
      setNow(timestamp);
      safelyEdit(() => workoutStore.getState().clearExpiredRestTimer(timestamp));
    };
    tick();
    return startRestTicker(tick);
  }, [timer]);

  return (
    <QueryClientProvider client={queryClient}>
      <CloudSyncLifecycle />
      <RestCountdownContext value={getRemainingRestSeconds(timer, now)}>{children}</RestCountdownContext>
    </QueryClientProvider>
  );
}
