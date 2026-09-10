import { forwardRef, useState } from 'react';
import { Pressable as NativePressable, type PressableProps, type View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
// Resolve NativeWind classes at the native host, after Reanimated processes styles.
const Host = forwardRef<View, PressableProps & { hostClassName?: string }>(({ hostClassName, ...props }, ref) => <NativePressable {...props} className={hostClassName} ref={ref} />);
const AnimatedPressable = Animated.createAnimatedComponent(Host);
/** One press contract for app-owned buttons; preserves layout, refs, and caller handlers. */
export const Pressable = forwardRef<View, PressableProps>(function MotionPressable({ className, style, disabled, onPressIn, onPressOut, onHoverIn, onHoverOut, ...props }, ref) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const progress = useSharedValue(0);
  const motion = useAnimatedStyle(() => ({ transform: [{ scale: 1 - progress.value * .025 }], opacity: disabled ? .45 : 1 - progress.value * .15 }));
  return <AnimatedPressable hostClassName={className} ref={ref} {...props} disabled={disabled}
    style={[{ minHeight: 48 }, typeof style === 'function' ? style({ pressed, hovered }) : style, motion]}
    onHoverIn={event => {setHovered(true);onHoverIn?.(event);}} onHoverOut={event => {setHovered(false);onHoverOut?.(event);}}
    onPressIn={event => { if (!disabled) { setPressed(true); progress.value = withTiming(1, { duration: 90, reduceMotion: ReduceMotion.System }); } onPressIn?.(event); }}
    onPressOut={event => { setPressed(false); progress.value = withTiming(0, { duration: 140, reduceMotion: ReduceMotion.System }); onPressOut?.(event); }} />;
});
