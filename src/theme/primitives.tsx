import { forwardRef } from 'react';
import { Text as NativeText, TextInput as NativeInput, StyleSheet, type TextProps, type TextInputProps } from 'react-native';
import { useThemeStore } from './store';
import { palettes } from './palette';
function typography(style: TextProps['style'], className?: string) {
  const flat = StyleSheet?.flatten?.(style) ?? {};
  const bold = Number(flat.fontWeight) >= 600 || /font-(bold|semibold|black|extrabold)/.test(className ?? '');
  return { fontFamily: bold ? 'ManjariBold' : /font-light/.test(className ?? '') ? 'ManjariLight' : 'Manjari', fontWeight: 'normal' as const };
}
export const Text = forwardRef<NativeText, TextProps>(function CalCampText({ style, ...props }, ref) {
  const mode = useThemeStore(s => s.mode);
  return <NativeText ref={ref} {...props} style={[style, typography(style, props.className), { color: palettes[mode].ink }]} />;
});
export const TextInput = forwardRef<NativeInput, TextInputProps>(function CalCampInput({ style, ...props }, ref) {
  const mode = useThemeStore(s => s.mode);
  return <NativeInput ref={ref} {...props} placeholderTextColor={palettes[mode].ink} selectionColor={palettes[mode].protein} style={[{ minHeight: 48, fontSize: 16, paddingVertical: 12 }, style, typography(style, props.className), { color: palettes[mode].ink }]} />;
});
