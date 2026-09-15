import { forwardRef } from 'react';
import { Text as NativeText, TextInput as NativeInput, StyleSheet, type TextProps, type TextInputProps } from 'react-native';
import { useThemeStore } from './store';
import { palettes } from './palette';
function typography(style: TextProps['style'], className?: string) {
  const flat = StyleSheet?.flatten?.(style) ?? {};
  const bold = Number(flat.fontWeight) >= 600 || /font-(bold|semibold|black|extrabold)/.test(className ?? '');
  return { fontFamily: bold ? 'GoogleSansBold' : /font-(semibold|medium)/.test(className ?? '') ? 'GoogleSansMedium' : 'GoogleSans', fontWeight: 'normal' as const };
}
export const Text = forwardRef<NativeText, TextProps>(function CalCampText({ style, ...props }, ref) {
  const mode = useThemeStore(s => s.mode);
  return <NativeText ref={ref} {...props} style={[style, typography(style, props.className), { color: palettes[mode].ink }]} />;
});
export const TextInput = forwardRef<NativeInput, TextInputProps>(function CalCampInput({ style, ...props }, ref) {
  const mode = useThemeStore(s => s.mode);
  const palette = palettes[mode];
  // placeholderTextColor sits BEFORE the spread so a caller can still override it. It used to
  // sit after, which both ignored the caller and drew the placeholder in full ink — a hint
  // indistinguishable from text you had already typed.
  // A single-line box is centred by the platform only when nothing pushes the text down. Any
  // vertical padding defeats that on iOS and leaves the glyphs riding high inside a 48pt tap
  // target; textAlignVertical does the same job on Android. This rule sits LAST so a caller's
  // `py-3` styles the box without silently moving the text off centre.
  const vertical = { paddingVertical: props.multiline ? 12 : 0, textAlignVertical: props.multiline ? 'top' as const : 'center' as const };
  return <NativeInput ref={ref} placeholderTextColor={palette.muted} {...props} selectionColor={palette.protein}
    style={[{ minHeight: 48, fontSize: 16 }, style, typography(style, props.className), { color: palette.ink }, vertical]} />;
});
