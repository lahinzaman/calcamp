/** Locales the app ships. `rtl` drives layout direction, not just text alignment. */
export const LOCALES = [
  { tag: 'en', label: 'English', native: 'English', rtl: false },
  { tag: 'es', label: 'Spanish', native: 'Español', rtl: false },
  { tag: 'fr', label: 'French', native: 'Français', rtl: false },
  { tag: 'de', label: 'German', native: 'Deutsch', rtl: false },
  { tag: 'it', label: 'Italian', native: 'Italiano', rtl: false },
  { tag: 'pt', label: 'Portuguese', native: 'Português', rtl: false },
  { tag: 'ru', label: 'Russian', native: 'Русский', rtl: false },
  { tag: 'zh', label: 'Chinese', native: '中文', rtl: false },
  { tag: 'ja', label: 'Japanese', native: '日本語', rtl: false },
  { tag: 'ko', label: 'Korean', native: '한국어', rtl: false },
  { tag: 'hi', label: 'Hindi', native: 'हिन्दी', rtl: false },
  { tag: 'bn', label: 'Bangla', native: 'বাংলা', rtl: false },
  { tag: 'ar', label: 'Arabic', native: 'العربية', rtl: true },
  { tag: 'ur', label: 'Urdu', native: 'اردو', rtl: true },
] as const;

export type LocaleTag = typeof LOCALES[number]['tag'];
export const DEFAULT_LOCALE: LocaleTag = 'en';
export const localeInfo = (tag: string) => LOCALES.find(locale => locale.tag === tag) ?? LOCALES[0];
export const isRtl = (tag: string) => localeInfo(tag).rtl;

/** Matches a device language such as "pt-BR" or "zh-Hans-CN" to a locale we ship. */
export function resolveLocale(candidates: readonly (string | null | undefined)[]): LocaleTag {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const base = candidate.toLowerCase().split(/[-_]/)[0];
    const match = LOCALES.find(locale => locale.tag === base);
    if (match) return match.tag;
  }
  return DEFAULT_LOCALE;
}
