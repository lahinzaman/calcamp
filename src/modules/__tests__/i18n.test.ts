import assert from 'node:assert/strict';
import { test } from 'node:test';

import { en, type MessageKey } from '../../i18n/en';
import { LOCALES, DEFAULT_LOCALE, isRtl, resolveLocale } from '../../i18n/locales';
import { translations } from '../../i18n/translations';

const keys = Object.keys(en) as MessageKey[];
const placeholders = (value: string) => (value.match(/\{(\w+)\}/g) ?? []).sort();

test('every shipped locale has a catalogue, and English is the source', () => {
  assert.equal(LOCALES[0].tag, DEFAULT_LOCALE);
  assert.equal(new Set(LOCALES.map(locale => locale.tag)).size, LOCALES.length);
  for (const locale of LOCALES) {
    if (locale.tag === DEFAULT_LOCALE) continue;
    assert.ok(translations[locale.tag], `${locale.tag} has no catalogue`);
  }
  // Arabic and Urdu are the right-to-left pair; nothing else should claim to be.
  assert.deepEqual(LOCALES.filter(locale => locale.rtl).map(locale => locale.tag), ['ar', 'ur']);
  assert.equal(isRtl('ar'), true);
  assert.equal(isRtl('fr'), false);
});

test('no translation invents a key, and every key it does have is a real string', () => {
  const known = new Set<string>(keys);
  for (const [tag, table] of Object.entries(translations)) {
    for (const [key, value] of Object.entries(table)) {
      assert.ok(known.has(key), `${tag} has an unknown key: ${key}`);
      assert.equal(typeof value, 'string', `${tag}.${key} is not a string`);
      assert.ok((value as string).trim().length > 0, `${tag}.${key} is empty`);
    }
  }
});

test('placeholders survive translation, in any word order', () => {
  for (const [tag, table] of Object.entries(translations)) {
    for (const [key, value] of Object.entries(table)) {
      // A dropped {kcal} would render a sentence with a hole in it.
      assert.deepEqual(placeholders(value as string), placeholders(en[key as MessageKey]),
        `${tag}.${key} does not carry the same placeholders`);
    }
  }
});

test('a language is not shipped half-finished', () => {
  for (const [tag, table] of Object.entries(translations)) {
    const covered = keys.filter(key => key in table).length;
    assert.equal(covered, keys.length, `${tag} covers ${covered} of ${keys.length} keys`);
  }
});

test('a device language is matched by its base tag, and anything unknown falls back', () => {
  assert.equal(resolveLocale(['pt-BR']), 'pt');
  assert.equal(resolveLocale(['zh-Hans-CN']), 'zh');
  assert.equal(resolveLocale(['ES_es']), 'es');
  assert.equal(resolveLocale([null, undefined, 'xx', 'fr-CA']), 'fr');
  assert.equal(resolveLocale(['klingon']), DEFAULT_LOCALE);
  assert.equal(resolveLocale([]), DEFAULT_LOCALE);
});
