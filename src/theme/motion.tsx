import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, ReduceMotion, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useThemeStore } from './store';
import { palettes } from './palette';

/** One motion vocabulary. Springs carry state changes; timings carry appearance. */
export const SPRING = {
  press: { damping: 22, stiffness: 420, mass: .55, reduceMotion: ReduceMotion.System },
  bar: { damping: 20, stiffness: 140, mass: .9, reduceMotion: ReduceMotion.System },
  pop: { damping: 12, stiffness: 260, mass: .7, reduceMotion: ReduceMotion.System },
  sheet: { damping: 24, stiffness: 220, mass: .8, reduceMotion: ReduceMotion.System },
} as const;
export const TIMING = { fast: 140, base: 200, slow: 320, reduceMotion: ReduceMotion.System } as const;
export const ENTER_STAGGER = 55;

/**
 * Entrance for a list row. Deliberately has NO layout animation: FlashList recycles and
 * repositions cells as you scroll, and animating those repositions makes rows visibly
 * slide around mid-scroll. Row-level enter/exit is safe; cell-level layout is not.
 */
export function AnimatedRow({ children }: PropsWithChildren) {
  return <Animated.View entering={FadeIn.duration(TIMING.fast).reduceMotion(ReduceMotion.System)}>{children}</Animated.View>;
}

/** Entrance for stacked cards: index drives a short stagger so a screen assembles rather than blinks. */
export function Reveal({ index = 0, children, style }: PropsWithChildren<{ index?: number; style?: ViewStyle }>) {
  const reduced = useReducedMotion();
  const offset = useSharedValue(reduced ? 0 : 14); const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) { offset.value = 0; opacity.value = 1; return; }
    const delay = Math.min(index, 8) * ENTER_STAGGER;
    offset.value = withDelay(delay, withSpring(0, SPRING.bar));
    opacity.value = withDelay(delay, withTiming(1, { duration: TIMING.slow, reduceMotion: ReduceMotion.System }));
  }, [index, reduced, offset, opacity]);
  const motion = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: offset.value }] }));
  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
}

/** Counts to a new total instead of snapping, so a log reads as an increase. */
export function useCountUp(value: number, duration = 650) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value); const from = useRef(value); const frame = useRef<number | null>(null);
  useEffect(() => {
    const start = from.current; const delta = value - start;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    if (reduced || !raf || !Number.isFinite(delta) || Math.abs(delta) < .5) { from.current = value; setShown(Math.round(value)); return; }
    const began = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - began) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = start + delta * eased;
      from.current = next; setShown(Math.round(next));
      if (t < 1) frame.current = raf(step);
    };
    frame.current = raf(step);
    // Only stop the frame. This used to also set from.current to this effect's target, which
    // is a claim the animation finished. Interrupt it — by choosing another day mid-count — and
    // the next run started from a number that was never on screen, so the figure leapt up to the
    // previous day's total before counting down to the real one.
    return () => { if (frame.current !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame.current); };
  }, [value, duration, reduced]);
  return shown;
}

export function ProgressBar({ value, target, tone = 'protein', height = 8 }: { value: number; target: number; tone?: 'protein' | 'carbs' | 'fat'; height?: number }) {
  const mode = useThemeStore(s => s.mode); const palette = palettes[mode];
  const progress = useSharedValue(0); const over = useSharedValue(0);
  const raw = target > 0 && Number.isFinite(value) ? value / target : 0;
  const ratio = Math.max(0, Math.min(1, raw));
  const exceeded = raw > 1.02 ? 1 : 0;
  useEffect(() => { progress.value = withSpring(ratio, SPRING.bar); }, [ratio, progress]);
  useEffect(() => { over.value = withTiming(exceeded, { duration: TIMING.slow, reduceMotion: ReduceMotion.System }); }, [exceeded, over]);
  const style = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as `${number}%`,
    backgroundColor: interpolateColor(over.value, [0, 1], [palette[tone], palette.carbs]),
  }));
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }} style={{ height, borderRadius: height / 2, backgroundColor: palette.raised, overflow: 'hidden' }}>
    <Animated.View style={[{ height, borderRadius: height / 2 }, style]} />
  </View>;
}

/** Pulses once when `trigger` changes, marking that a value the user just submitted landed. */
export function Pop({ trigger, children }: PropsWithChildren<{ trigger: unknown }>) {
  const reduced = useReducedMotion(); const scale = useSharedValue(1); const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduced) return;
    scale.value = withSequence(withSpring(1.06, SPRING.pop), withSpring(1, SPRING.pop));
  }, [trigger, reduced, scale]);
  const motion = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={motion}>{children}</Animated.View>;
}

/** Breathing placeholder: signals "loading", not "empty". */
export function Skeleton({ height = 80, style }: { height?: number; style?: ViewStyle }) {
  const mode = useThemeStore(s => s.mode); const reduced = useReducedMotion(); const glow = useSharedValue(.55);
  useEffect(() => {
    if (reduced) { glow.value = .8; return; }
    glow.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }), -1, true);
  }, [reduced, glow]);
  const motion = useAnimatedStyle(() => ({ opacity: glow.value }));
  return <Animated.View entering={FadeIn.duration(TIMING.fast).reduceMotion(ReduceMotion.System)} style={[{ height, borderRadius: 16, backgroundColor: palettes[mode].raised }, style, motion]} />;
}
