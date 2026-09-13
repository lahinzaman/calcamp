import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
let stored: Record<string, string> = {};
let rtlForced: boolean | null = null;
mock.module('../sync/storage.ts', { namedExports: { durableStorage: {
  get: (k: string) => stored[k], set: (k: string, v: string) => { stored[k] = v; } } } });
mock.module('react-native', { namedExports: { I18nManager: {
  isRTL: false, allowRTL: () => {}, forceRTL: (value: boolean) => { rtlForced = value; } } } });
mock.module('expo-localization', { namedExports: { getLocales: () => [{ languageTag: 'ar-EG', languageCode: 'ar' }] } });

const i18n = require('../../i18n/index.tsx') as typeof import('../../i18n/index');

test('with no stored preference the device language is used', () => {
  assert.equal(i18n.currentLocale(), 'ar');
  assert.equal(i18n.t('tab.today'), 'اليوم');
});
test('choosing a language overrides the device and persists', () => {
  i18n.setLocale('ja');
  assert.equal(i18n.currentLocale(), 'ja');
  assert.equal(stored.locale, 'ja');
  assert.equal(i18n.t('tab.today'), '今日');
  assert.equal(rtlForced, false, 'Japanese is not right-to-left');
});
test('placeholders are filled after lookup, so word order is the translation’s business', () => {
  assert.equal(i18n.t('today.gramsLeft', { grams: 12 }, 'en'), '12 g left');
  assert.equal(i18n.t('today.gramsLeft', { grams: 12 }, 'de'), 'Noch 12 g');
  assert.equal(i18n.t('day.under', { kcal: 300 }, 'ar'), 'أقل من الهدف بـ 300 سعرة');
  // An unknown placeholder is left visible rather than becoming "undefined".
  assert.match(i18n.t('today.gramsLeft', {}, 'en'), /\{grams\}/);
});
test('switching to Arabic forces right-to-left', () => {
  i18n.setLocale('ar');
  assert.equal(rtlForced, true);
  assert.equal(i18n.needsRestartForDirection(), true, 'the running layout has not flipped yet');
});
test('back to the device setting re-resolves rather than freezing the last choice', () => {
  i18n.setLocale(i18n.SYSTEM);
  assert.equal(i18n.currentPreference(), 'system');
  assert.equal(i18n.currentLocale(), 'ar');
});
