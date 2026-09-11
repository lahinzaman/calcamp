import { forwardRef, useState } from 'react';
import { Pressable as NativePressable, type PressableProps, type View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SPRING } from './motion';
import { haptic, type HapticTone } from './haptics';
// Resolve NativeWind classes at the native host, after Reanimated processes styles.
const Host = forwardRef<View, PressableProps & { hostClassName?: string }>(({ hostClassName, ...props }, ref) => <NativePressable {...props} className={hostClassName} ref={ref} />);
const AnimatedPressable = Animated.createAnimatedComponent(Host);
export interface MotionPressableProps extends PressableProps {
  /** Press depth; `firm` suits large primary buttons, `subtle` suits dense rows. */
  weight?: 'subtle' | 'standard' | 'firm';
  /** Tactile confirmation on press-in. `none` opts a control out. */
  tone?: HapticTone;
}
const DEPTH = { subtle: .015, standard: .035, firm: .055 } as const;
/** One press contract for app-owned buttons; preserves layout, refs, and caller handlers. */
export const Pressable = forwardRef<View, MotionPressableProps>(function MotionPressable({ className, style, disabled, weight = 'standard', tone = 'light', onPressIn, onPressOut, onHoverIn, onHoverOut, ...props }, ref) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const progress = useSharedValue(0);
  const hover = useSharedValue(0);
  const motion = useAnimatedStyle(() => ({
    transform: [{ scale: (1 - progress.value * DEPTH[weight]) * (1 + hover.value * .012) }],
    opacity: disabled ? .45 : 1 - progress.value * .12,
  }));
  return <AnimatedPressable hostClassName={className} ref={ref} {...props} disabled={disabled}
    style={[{ minHeight: 48 }, typeof style === 'function' ? style({ pressed, hovered }) : style, motion]}
    onHoverIn={event => { setHovered(true); hover.value = withSpring(1, SPRING.press); onHoverIn?.(event); }}
    onHoverOut={event => { setHovered(false); hover.value = withSpring(0, SPRING.press); onHoverOut?.(event); }}
    onPressIn={event => { if (!disabled) { setPressed(true); progress.value = withSpring(1, SPRING.press); haptic(tone); } onPressIn?.(event); }}
    onPressOut={event => { setPressed(false); progress.value = withSpring(0, SPRING.press); onPressOut?.(event); }} />;
});
