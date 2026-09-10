import { useEffect, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';
import { useThemeStore } from './store';
import { palettes } from './palette';
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' ');
export function ThemeRoot({ children, transparent = false }: PropsWithChildren<{transparent?:boolean}>) {
  const mode = useThemeStore(s => s.mode);
  return <View style={[{ flex: 1, backgroundColor: transparent ? 'transparent' : palettes[mode].background }, vars(Object.fromEntries(Object.entries(palettes[mode]).map(([key, value]) => [`--color-${key}`, rgb(value)])))]}>{children}</View>;
}
export function HydrateTheme() { useEffect(() => useThemeStore.getState().hydrate(), []); return null; }
