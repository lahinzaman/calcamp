import { useEffect, useState } from 'react';
import { View, type TextInputProps } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming, ReduceMotion } from 'react-native-reanimated';
import { Pressable } from '../theme/Pressable';
import { Text, TextInput } from '../theme/primitives';
import { TIMING } from '../theme/motion';
import { useThemeStore } from '../theme/store';
import { palettes } from '../theme/palette';
export function Field({ label, onFocus, onBlur, ...props }: TextInputProps & { label: string }) {
  const mode = useThemeStore(s => s.mode); const palette = palettes[mode];
  const focus = useSharedValue(0);
  const ring = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [palette.border, palette.protein]),
    transform: [{ scale: 1 + focus.value * .006 }],
  }));
  return <View className="mb-4 gap-2"><Text className="text-sm font-semibold text-ink">{label}</Text>
    <Animated.View style={[{ borderWidth: 1, borderRadius: 12, backgroundColor: palette.surface }, ring]}>
      <TextInput accessibilityLabel={label} placeholderTextColor="#71717a" {...props}
        onFocus={event => { focus.value = withTiming(1, { duration: TIMING.fast, reduceMotion: ReduceMotion.System }); onFocus?.(event); }}
        onBlur={event => { focus.value = withTiming(0, { duration: TIMING.base, reduceMotion: ReduceMotion.System }); onBlur?.(event); }}
        className="px-4 py-3 text-base text-ink" />
    </Animated.View>
  </View>;
}
export function Action({ label, onPress, disabled = false, secondary = false, tone }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; tone?: 'light' | 'medium' | 'success' | 'selection' | 'none' }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} weight={secondary ? 'standard' : 'firm'} tone={tone ?? (secondary ? 'light' : 'medium')} className={`mb-3 min-h-12 justify-center rounded-xl px-4 py-3 ${disabled || secondary ? 'bg-raised' : 'bg-accent'}`}><Text className="text-center font-semibold">{label}</Text></Pressable>;
}
export function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const mode = useThemeStore(s => s.mode); const palette = palettes[mode];
  const active = useSharedValue(selected ? 1 : 0);
  useEffect(() => { active.value = withTiming(selected ? 1 : 0, { duration: TIMING.base, reduceMotion: ReduceMotion.System }); }, [selected, active]);
  const fill = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(active.value, [0, 1], [palette.surface, palette.raised]) }));
  return <Animated.View style={[{ borderRadius: 12 }, fill]} className="mb-2 mr-2">
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} tone="selection" weight="subtle" className="min-h-12 justify-center rounded-xl border border-border px-4 py-3"><Text className={selected ? 'font-semibold text-ink' : 'text-ink'}>{label}</Text></Pressable>
  </Animated.View>;
}

/** Keep the edit string so decimal points and temporarily blank numbers remain editable. */
export function NumericField({ value, onValue, ...props }: Omit<TextInputProps, 'value' | 'onChangeText'> & { label: string; value: number | null; onValue: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  return <Field {...props} value={text} onChangeText={next => { setText(next); onValue(next.trim() ? Number(next) : null); }} />;
}
