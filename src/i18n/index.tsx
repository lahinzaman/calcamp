import { useSyncExternalStore } from 'react';
import { I18nManager } from 'react-native';
import { durableStorage } from '../modules/sync/storage';
import { en, type Catalogue, type MessageKey } from './en';
import { DEFAULT_LOCALE, isRtl, resolveLocale, type LocaleTag } from './locales';
import { translations } from './translations';

const KEY = 'locale';
/** Sentinel for "whatever the device is set to", which can change without the app knowing. */
export const SYSTEM = 'system';
export type LocalePreference = LocaleTag | typeof SYSTEM;

function deviceLocales(): string[] {
  try {
    // Optional: the module is absent in tests and on some web targets.
    const localization = require('expo-localization') as { getLocales?: () => { languageCode?: string | null; languageTag?: string | null }[] };
    return (localization.getLocales?.() ?? []).flatMap(entry => [entry.languageTag, entry.languageCode].filter(Boolean) as string[]);
  } catch { return []; }
}

let preference: LocalePreference = (() => {
  try {
    const stored = durableStorage.get(KEY);
    return stored === SYSTEM || (stored && resolveLocale([stored]) === stored) ? stored as LocalePreference : SYSTEM;
  } catch { return SYSTEM; }
})();
let active: LocaleTag = preference === SYSTEM ? resolveLocale(deviceLocales()) : preference;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export const currentLocale = () => active;
export const currentPreference = () => preference;

export function setLocale(next: LocalePreference) {
  preference = next;
  active = next === SYSTEM ? resolveLocale(deviceLocales()) : next;
  try { durableStorage.set(KEY, next); } catch { /* the preference is cosmetic */ }
  // Right-to-left is a layout change, so it only fully applies on the next launch.
  try { I18nManager.allowRTL(isRtl(active)); I18nManager.forceRTL(isRtl(active)); } catch { /* unsupported on web */ }
  emit();
}
/** True when the running layout direction does not yet match the chosen language. */
export const needsRestartForDirection = () => {
  try { return !!I18nManager.isRTL !== isRtl(active); } catch { return false; }
};

function lookup(key: MessageKey, locale: LocaleTag): string {
  const table = locale === DEFAULT_LOCALE ? undefined : (translations as Partial<Record<LocaleTag, Partial<Catalogue>>>)[locale];
  return table?.[key] ?? en[key];
}
/** `{name}` placeholders are replaced after lookup, so translations keep them in their own word order. */
export function translate(key: MessageKey, params?: Record<string, string | number>, locale: LocaleTag = active): string {
  const template = lookup(key, locale);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match);
}

export function useLocale(): LocaleTag {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener); },
    () => active, () => active);
}
/** Components call this so a language change re-renders them. */
export function useT() {
  const locale = useLocale();
  return (key: MessageKey, params?: Record<string, string | number>) => translate(key, params, locale);
}
export const t = translate;
export { LOCALES, localeInfo, isRtl, resolveLocale } from './locales';
export type { LocaleTag } from './locales';
export type { MessageKey } from './en';
