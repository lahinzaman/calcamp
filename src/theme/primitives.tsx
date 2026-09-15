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
/** Tailwind's text-* classes set a lineHeight alongside the size. On a single-line iOS field an
 *  explicit lineHeight makes the text sit on the bottom of its line box instead of centring in
 *  the field, so the size is read off the class and applied as a plain fontSize, and the class
 *  itself is dropped before it can bring a lineHeight with it. */
const FONT_SIZES: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48, '6xl': 60, '7xl': 72 };
export function sizeWithoutLineHeight(className?: string) {
  const match = className?.match(/(?:^|\s)text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)(?![\w-])/);
  if (!match) return { fontSize: 16, className };
  return { fontSize: FONT_SIZES[match[1]], className: className!.replace(match[0], ' ').replace(/\s+/g, ' ').trim() };
}

export const TextInput = forwardRef<NativeInput, TextInputProps>(function CalCampInput({ style, ...props }, ref) {
  const mode = useThemeStore(s => s.mode);
  const palette = palettes[mode];
  const original = (props as { className?: string }).className;
  const sized = sizeWithoutLineHeight(original);
  // placeholderTextColor sits BEFORE the spread so a caller can still override it. It used to
  // sit after, which both ignored the caller and drew the placeholder in full ink — a hint
  // indistinguishable from text you had already typed.
  return <NativeInput ref={ref} placeholderTextColor={palette.muted} {...props} className={sized.className}
    selectionColor={palette.protein}
    style={[{ minHeight: 48, fontSize: sized.fontSize }, style, typography(style, original), { color: palette.ink },
      // Vertical layout is the field's business, not the caller's. Padding stays with whoever
      // styled the box; only the text's place inside it is settled here.
      { lineHeight: undefined, textAlignVertical: props.multiline ? 'top' : 'center' }]} />;
});
