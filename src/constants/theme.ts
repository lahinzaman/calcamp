import { palettes } from '../theme/palette';
const colors = (p: typeof palettes[keyof typeof palettes]) => ({ text: p.ink, background: p.background, backgroundElement: p.surface, backgroundSelected: p.raised, textSecondary: p.ink });
export const Colors = { light: colors(palettes.light), dark: colors(palettes.dark), gray: colors(palettes.gray) };
export type ThemeColor = keyof typeof Colors.light;
export const Fonts = { sans: 'Manjari', serif: 'Manjari', rounded: 'Manjari', mono: 'Manjari' };
export const Spacing = { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 } as const;
export const BottomTabInset = 80;
export const MaxContentWidth = 800;
