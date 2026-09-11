import { Platform } from 'react-native';
import type * as HapticsModule from 'expo-haptics';
export type HapticTone = 'none' | 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';
/** Web vibration is disruptive and unsupported on desktop; haptics stay native-only. */
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';
let muted = false;
let api: typeof HapticsModule | null = null;
export const setHapticsMuted = (value: boolean) => { muted = value; };
/** Loaded lazily so the web bundle and tests never initialize the native module. */
function load() {
  if (api || !enabled) return api;
  try { api = require('expo-haptics') as typeof HapticsModule; } catch { api = null; }
  return api;
}
/** Fire-and-forget: feedback must never reject a press handler or surface an error. */
export function haptic(tone: HapticTone = 'light') {
  if (!enabled || muted || tone === 'none') return;
  const H = load(); if (!H) return;
  const run = tone === 'selection' ? () => H.selectionAsync()
    : tone === 'success' ? () => H.notificationAsync(H.NotificationFeedbackType.Success)
    : tone === 'warning' ? () => H.notificationAsync(H.NotificationFeedbackType.Warning)
    : tone === 'error' ? () => H.notificationAsync(H.NotificationFeedbackType.Error)
    : () => H.impactAsync({ light: H.ImpactFeedbackStyle.Light, medium: H.ImpactFeedbackStyle.Medium, heavy: H.ImpactFeedbackStyle.Heavy }[tone]);
  try { void run().catch(() => {}); } catch { /* haptics are decorative */ }
}
