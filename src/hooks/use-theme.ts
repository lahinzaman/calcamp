import { Colors } from '../constants/theme';
import { useThemeStore } from '../theme/store';
export function useTheme() { return Colors[useThemeStore(s => s.mode)]; }
