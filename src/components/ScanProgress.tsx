import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Svg, Circle, G } from 'react-native-svg';
import Animated, { ReduceMotion, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '../theme/primitives';
import { TIMING } from '../theme/motion';
import { useThemeStore } from '../theme/store';
import { palettes } from '../theme/palette';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 132;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** How fast the reading closes the gap to the next real milestone, per tick. */
const CREEP = 0.05;
const TICK_MS = 120;

/**
 * A reading that only ever moves when the work does. `reach` is called at points that have
 * genuinely happened — bytes encoded, request answered, foods matched — and between them the
 * number eases toward the next one without arriving, because nothing has happened yet to say
 * it has. That keeps a slow model from looking like a frozen app, without claiming progress
 * the work has not made.
 */
export function useScanProgress() {
  const [value, setValue] = useState(0);
  const ceiling = useRef(0);
  const current = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => { if (timer.current) { clearInterval(timer.current); timer.current = null; } }, []);
  useEffect(() => stop, [stop]);

  const begin = useCallback(() => {
    current.current = 0; ceiling.current = 0.08; setValue(0);
    stop();
    timer.current = setInterval(() => {
      const gap = ceiling.current - current.current;
      if (gap <= 0.001) return;
      current.current += gap * CREEP;
      setValue(current.current);
    }, TICK_MS);
  }, [stop]);

  /** A milestone the work actually reached. Never moves the reading backwards. */
  const reach = useCallback((next: number) => {
    ceiling.current = Math.max(ceiling.current, Math.min(next, 0.97));
    if (current.current < ceiling.current) { current.current = Math.max(current.current, ceiling.current * 0.55); setValue(current.current); }
  }, []);

  const done = useCallback(() => { stop(); current.current = 1; ceiling.current = 1; setValue(1); }, [stop]);
  const reset = useCallback(() => { stop(); current.current = 0; ceiling.current = 0; setValue(0); }, [stop]);

  return { value, begin, reach, done, reset };
}

export function ScanProgress({ value, label }: { value: number; label: string }) {
  const mode = useThemeStore(s => s.mode); const palette = palettes[mode];
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const progress = useSharedValue(0);
  useEffect(() => { progress.value = withTiming(clamped, { duration: TIMING.base, reduceMotion: ReduceMotion.System }); }, [clamped, progress]);
  const animated = useAnimatedProps(() => ({ strokeDashoffset: CIRCUMFERENCE * (1 - progress.value) }));
  const percent = Math.round(clamped * 100);
  return <View className="items-center py-6" accessibilityRole="progressbar"
    accessibilityLabel={label} accessibilityValue={{ now: percent, min: 0, max: 100 }}>
    <View>
      <Svg width={SIZE} height={SIZE}>
        <G rotation={-90} originX={SIZE / 2} originY={SIZE / 2}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={palette.raised} strokeWidth={STROKE} fill="none" />
          <AnimatedCircle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={palette.protein} strokeWidth={STROKE}
            fill="none" strokeLinecap="round" strokeDasharray={CIRCUMFERENCE} animatedProps={animated} />
        </G>
      </Svg>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
        <Text className="text-3xl font-bold" style={{ fontVariant: ['tabular-nums'] }}>{percent}%</Text>
      </View>
    </View>
    <Text className="mt-3 text-center text-sm">{label}</Text>
  </View>;
}
