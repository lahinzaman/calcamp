import type { MacroTotals, MicronutrientTotals, NutrientKey } from '../../types/nutrition';

/**
 * Reads a US Nutrition Facts panel out of OCR text. Everything on a label is per the serving
 * it states, so the reading is "one serving" and the portion sheet scales from there.
 *
 * OCR of small print is imperfect, so this is deliberately conservative: a value has to look
 * like a nutrition line to be taken, a missing nutrient stays missing rather than becoming
 * zero, and the caller is told how much of the panel was actually found.
 */
export interface LabelReading {
  servingLabel: string | null;
  macros: Partial<MacroTotals>;
  micros: MicronutrientTotals;
  /** The four macros a diary entry needs, all present. */
  complete: boolean;
}

/** OCR reliably confuses these inside numbers. Only applied to the number, never the name. */
const digits = (raw: string) => raw
  .replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(/[sS]/g, '5').replace(/[^\d.]/g, '');

function amount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = digits(raw);
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 && value < 100_000 ? value : null;
}

type Rule = { key: keyof MacroTotals | NutrientKey; macro?: boolean; pattern: RegExp; max: number };
/** Order matters: "total fat" must win before a bare "fat", and "added sugars" before "sugars". */
const RULES: Rule[] = [
  { key: 'caloriesKcal', macro: true, max: 5000, pattern: /calories[^\d]{0,12}\b([\dolIisS.]+)/i },
  { key: 'saturated_fat_g', max: 500, pattern: /sat(?:urated)?\.?\s*fat[^\d]{0,12}\b([\dolIisS.]+)\s*g/i },
  { key: 'trans_fat_g', max: 500, pattern: /trans\s*fat[^\d]{0,12}\b([\dolIisS.]+)\s*g/i },
  { key: 'fatG', macro: true, max: 1000, pattern: /total\s*fat[^\d]{0,12}\b([\dolIisS.]+)\s*g/i },
  { key: 'cholesterol_mg', max: 10_000, pattern: /cholesterol[^\d]{0,12}\b([\dolIisS.]+)\s*mg/i },
  { key: 'sodium_mg', max: 50_000, pattern: /sodium[^\d]{0,12}\b([\dolIisS.]+)\s*mg/i },
  { key: 'fiber_g', max: 500, pattern: /(?:dietary\s*)?fib(?:er|re)[^\d]{0,12}\b([\dolIisS.]+)\s*g/i },
  { key: 'added_sugar_g', max: 500, pattern: /(?:includes\s*)?\b([\dolIisS.]+)\s*g\s*added\s*sugars?/i },
  { key: 'sugar_g', max: 500, pattern: /total\s*sugars?[^\d]{0,12}\b([\dolIisS.]+)\s*g/i },
  { key: 'carbsG', macro: true, max: 1000, pattern: /(?:total\s*)?carb(?:ohydrate)?s?\.?[^\d]{0,12}\b([\dolIisS.]+)\s*g/i },
  { key: 'proteinG', macro: true, max: 1000, pattern: /protein[^\d]{0,12}\b([\dolIisS.]+)\s*g/i },
  { key: 'potassium_mg', max: 50_000, pattern: /potassium[^\d]{0,12}\b([\dolIisS.]+)\s*mg/i },
  { key: 'calcium_mg', max: 10_000, pattern: /calcium[^\d]{0,12}\b([\dolIisS.]+)\s*mg/i },
  { key: 'iron_mg', max: 1000, pattern: /iron[^\d]{0,12}\b([\dolIisS.]+)\s*mg/i },
];

/** "Serving size 2/3 cup (55g)" — the parenthesised metric weight is the reliable half. */
export function servingFrom(text: string): string | null {
  const line = /serving\s*size[^\n]{0,60}/i.exec(text)?.[0];
  if (!line) return null;
  const cleaned = line.replace(/serving\s*size/i, '').replace(/\s+/g, ' ').trim();
  return cleaned.length >= 2 ? cleaned.slice(0, 60) : null;
}

export function parseNutritionLabel(text: string): LabelReading {
  const flat = text.replace(/\r/g, '\n');
  const macros: Partial<MacroTotals> = {};
  const micros: MicronutrientTotals = {};
  for (const rule of RULES) {
    const value = amount(rule.pattern.exec(flat)?.[1]);
    if (value === null || value > rule.max) continue;
    if (rule.macro) {
      if (macros[rule.key as keyof MacroTotals] === undefined) macros[rule.key as keyof MacroTotals] = value;
    } else if (micros[rule.key as NutrientKey] === undefined) micros[rule.key as NutrientKey] = value;
  }
  const complete = (['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const).every(key => typeof macros[key] === 'number');
  return { servingLabel: servingFrom(flat), macros, micros, complete };
}

/** What is still missing, so the screen can ask for exactly that rather than "try again". */
export function missingMacros(reading: LabelReading): string[] {
  const labels: Record<keyof MacroTotals, string> = { caloriesKcal: 'calories', proteinG: 'protein', carbsG: 'carbs', fatG: 'fat' };
  return (['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const)
    .filter(key => typeof reading.macros[key] !== 'number').map(key => labels[key]);
}
