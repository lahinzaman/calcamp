import { useEffect, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import Animated, { LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useThemeStore } from './store';
import { palettes } from './palette';
export function AnimatedRow({ children }: PropsWithChildren) {
  return <Animated.View layout={LinearTransition.duration(180).reduceMotion(ReduceMotion.System)}>{children}</Animated.View>;
}
export function ProgressBar({ value, target, tone = 'protein' }: { value: number; target: number; tone?: 'protein' | 'carbs' | 'fat' }) {
  const mode = useThemeStore(s => s.mode); const progress = useSharedValue(0);
  const ratio = target > 0 && Number.isFinite(value) ? Math.max(0, Math.min(1, value / target)) : 0;
  useEffect(() => { progress.value = withTiming(ratio, { duration: 450, reduceMotion: ReduceMotion.System }); }, [ratio, progress]);
  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` as `${number}%` }));
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }} style={{ height: 8, borderRadius: 4, backgroundColor: palettes[mode].raised, overflow: 'hidden' }}><Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: palettes[mode][tone] }, style]} /></View>;
}

import type { ViewProps } from 'react-native';
/** Preserve FlashList's positioning/onLayout props while animating the positioned cell. */
export function AnimatedListCell({ index: _index, ...props }: ViewProps & { index?: number }) {
  return <Animated.View {...props} layout={LinearTransition.duration(180).reduceMotion(ReduceMotion.System)} />;
}
