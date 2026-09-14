import { useEffect } from 'react';
import { View } from 'react-native';
import { create } from 'zustand';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../theme/primitives';
import { Pressable } from '../theme/Pressable';
import { TIMING } from '../theme/motion';

/** Long enough to read a food name, short enough not to sit over the next thing you tap. */
const DWELL_MS = 2600;

interface ToastState {
  message: string | null;
  /** Bumped on every show so an identical message re-triggers the timer and the animation. */
  token: number;
  show: (message: string) => void;
  dismiss: () => void;
}
export const useToastStore = create<ToastState>(set => ({
  message: null, token: 0,
  show: message => set(state => ({ message: message.trim().slice(0, 120), token: state.token + 1 })),
  dismiss: () => set({ message: null }),
}));

/**
 * Confirms something was written down. Logging a food used to close its sheet and leave you on
 * a screen that looked unchanged until you went looking for the entry — indistinguishable from
 * a tap that missed.
 */
export const confirmToast = (message: string) => useToastStore.getState().show(message);

export function Toast() {
  const message = useToastStore(state => state.message);
  const token = useToastStore(state => state.token);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => useToastStore.getState().dismiss(), DWELL_MS);
    return () => clearTimeout(timer);
  }, [message, token]);
  if (!message) return null;
  return <Animated.View key={token} pointerEvents="box-none"
    entering={FadeInDown.duration(TIMING.base).reduceMotion(ReduceMotion.System)}
    exiting={FadeOutDown.duration(TIMING.fast).reduceMotion(ReduceMotion.System)}
    style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 92, alignItems: 'center' }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss confirmation"
      onPress={() => useToastStore.getState().dismiss()} weight="subtle"
      className="max-w-xl rounded-2xl border border-border bg-raised px-5 py-4">
      {/* alert, so it is spoken: the visual confirmation is useless to a screen reader. */}
      <View accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Text className="text-center font-semibold">{message}</Text>
      </View>
    </Pressable>
  </Animated.View>;
}
