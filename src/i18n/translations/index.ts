import type { Catalogue } from '../en';
import { ar } from './ar';
import { bn } from './bn';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';
import { hi } from './hi';
import { it } from './it';
import { ja } from './ja';
import { ko } from './ko';
import { pt } from './pt';
import { ru } from './ru';
import { ur } from './ur';
import { zh } from './zh';

/** Partial by design: any key a language has not reached falls back to English. */
export const translations: Record<string, Partial<Catalogue>> = { ar, bn, de, es, fr, hi, it, ja, ko, pt, ru, ur, zh };
