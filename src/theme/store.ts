import { create } from 'zustand';
import { durableStorage } from '../modules/sync/storage';
import { THEMES, type ThemeMode } from './palette';
export const useThemeStore = create<{ mode: ThemeMode; hydrate: () => void; setMode: (mode: ThemeMode) => void }>(set => ({
  mode: 'light',
  hydrate: () => { try { const mode = durableStorage.get('calcamp:theme'); if (THEMES.includes(mode as ThemeMode)) set({ mode: mode as ThemeMode }); } catch { /* Light remains usable when storage is unavailable. */ } },
  setMode: mode => { if (!THEMES.includes(mode)) return; try { durableStorage.set('calcamp:theme', mode); } catch { /* Apply this session even if persistence is unavailable. */ } set({ mode }); },
}));
