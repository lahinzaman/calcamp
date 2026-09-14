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
  return <NativeInput ref={ref} placeholderTextColor={palette.muted} {...props} selectionColor={palette.protein}
    style={[{ minHeight: 48, fontSize: 16, paddingVertical: 12,
      // A single-line box taller than its text lays out from the top on Android, leaving the
      // text sitting high against the border instead of centred in it.
      textAlignVertical: props.multiline ? 'top' : 'center' },
      style, typography(style, props.className), { color: palette.ink }]} />;
});
