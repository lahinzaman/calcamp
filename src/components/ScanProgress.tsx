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
/** How fast the reading closes the gap to where it is drifting, per tick. */
const CREEP = 0.05;
const TICK_MS = 120;
/** How far past a reached milestone the reading may drift, as a share of what is left. */
const LOOKAHEAD = 0.45;
/** Never drift to completion: only finishing the work is allowed to say 100%. */
const CAP = 0.97;

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
    current.current = 0; ceiling.current = 0.1; setValue(0);
    stop();
    timer.current = setInterval(() => {
      const gap = ceiling.current - current.current;
      if (gap <= 0.001) return;
      current.current += gap * CREEP;
      setValue(current.current);
    }, TICK_MS);
  }, [stop]);

  /**
   * A milestone the work actually reached: the reading goes to it, because it is true. It then
   * drifts partway toward whatever comes next, so a long wait still moves and a short one does
   * not stall. Showing a fraction of a milestone instead — which is what this used to do — left
   * a fast scan sitting near half and then jumping to done.
   */
  const reach = useCallback((next: number) => {
    const milestone = Math.min(Math.max(next, 0), CAP);
    if (milestone > current.current) { current.current = milestone; setValue(milestone); }
    ceiling.current = Math.max(ceiling.current, Math.min(CAP, milestone + (1 - milestone) * LOOKAHEAD));
  }, []);

  const done = useCallback(() => { stop(); current.current = 1; ceiling.current = 1; setValue(1); }, [stop]);
  const reset = useCallback(() => { stop(); current.current = 0; ceiling.current = 0; setValue(0); }, [stop]);

  return { value, begin, reach, done, reset };
}

/** `onDark` draws the ring over a live camera preview, where the theme's ink would vanish. */
export function ScanProgress({ value, label, onDark = false }: { value: number; label: string; onDark?: boolean }) {
  const mode = useThemeStore(s => s.mode); const palette = palettes[mode];
  const track = onDark ? 'rgba(255,255,255,.25)' : palette.raised;
  const sweep = onDark ? '#fff' : palette.protein;
  const ink = onDark ? { color: '#fff' } : undefined;
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
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={track} strokeWidth={STROKE} fill="none" />
          <AnimatedCircle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={sweep} strokeWidth={STROKE}
            fill="none" strokeLinecap="round" strokeDasharray={CIRCUMFERENCE} animatedProps={animated} />
        </G>
      </Svg>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
        <Text className="text-3xl font-bold" style={[{ fontVariant: ['tabular-nums'] }, ink]}>{percent}%</Text>
      </View>
    </View>
    <Text className="mt-3 text-center text-sm" style={ink}>{label}</Text>
  </View>;
}
