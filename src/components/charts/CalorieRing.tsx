import { useEffect } from 'react';
import { View } from 'react-native';
import { Svg, Circle, G } from 'react-native-svg';
import Animated, { ReduceMotion, useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text } from '../../theme/primitives';
import { SPRING, useCountUp } from '../../theme/motion';
import { useThemeStore } from '../../theme/store';
import { palettes } from '../../theme/palette';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 208;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Sweeps from the top; over-target keeps the ring full and recolours rather than wrapping. */
export function CalorieRing({ consumed, target }: { consumed: number; target: number | null }) {
  const mode = useThemeStore(s => s.mode); const palette = palettes[mode];
  const ratio = target && target > 0 ? consumed / target : 0;
  const clamped = Math.max(0, Math.min(1, ratio));
  const over = ratio > 1.02;
  const progress = useSharedValue(0);
  useEffect(() => { progress.value = withSpring(clamped, SPRING.bar); }, [clamped, progress]);
  const animated = useAnimatedProps(() => ({ strokeDashoffset: CIRCUMFERENCE * (1 - progress.value) }));
  const shown = useCountUp(Math.round(consumed));
  const remaining = target === null ? null : Math.round(target - consumed);
  return <View className="items-center" accessibilityRole="progressbar"
    accessibilityValue={{ now: Math.round(consumed), max: target ?? undefined }}>
    <Svg width={SIZE} height={SIZE}>
      <G rotation={-90} originX={SIZE / 2} originY={SIZE / 2}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={palette.raised} strokeWidth={STROKE} fill="none" />
        <AnimatedCircle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={over ? palette.fat : palette.protein}
          strokeWidth={STROKE} fill="none" strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE} animatedProps={animated} />
      </G>
    </Svg>
    <View style={{ position: 'absolute', top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      <Text className="text-5xl font-bold" style={{ fontVariant: ['tabular-nums'] }}>{shown.toLocaleString()}</Text>
      <Text className="text-sm">{target === null ? 'kcal logged' : 'of ' + Math.round(target).toLocaleString() + ' kcal'}</Text>
      {remaining !== null && <Text className="mt-1 text-sm font-bold">{remaining >= 0 ? `${remaining.toLocaleString()} kcal remaining` : `${Math.abs(remaining).toLocaleString()} kcal above target`}</Text>}
    </View>
  </View>;
}
