import React from 'react';
/** Single source of truth for the Reanimated surface the UI uses; keep in step with src/theme/motion.tsx. */
const transition: Record<string, () => unknown> = {};
for (const key of ['duration', 'delay', 'reduceMotion', 'springify', 'withInitialValues', 'easing']) transition[key] = () => transition;
export const reanimatedMock = {
  defaultExport: { View: 'AnimatedView', ScrollView: 'AnimatedScrollView', Text: 'AnimatedText', createAnimatedComponent: (component: unknown) => component },
  namedExports: {
    ReduceMotion: { System: 'system', Never: 'never', Always: 'always' },
    Easing: { inOut: (fn: unknown) => fn, out: (fn: unknown) => fn, quad: () => 0, cubic: () => 0 },
    LinearTransition: transition, FadeIn: transition, FadeOut: transition,
    FadeInDown: transition, FadeOutDown: transition, FadeInUp: transition, FadeOutUp: transition,
    useReducedMotion: () => false,
    useSharedValue: (value: unknown) => React.useRef({ value }).current,
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useAnimatedProps: (fn: () => unknown) => fn(),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    withTiming: (value: unknown) => value,
    withSpring: (value: unknown) => value,
    withDelay: (_delay: number, value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withRepeat: (value: unknown) => value,
    interpolate: (value: number) => value,
    interpolateColor: (_value: number, _input: readonly number[], output: readonly string[]) => output[0],
    runOnJS: (fn: unknown) => fn,
  },
};
