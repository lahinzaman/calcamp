import type { MacroTotals, MicronutrientTotals, NutrientKey } from '../../types/nutrition';

/**
 * Reads a US Nutrition Facts panel out of OCR. Everything on a label is per the serving it
 * states, so the reading is "one serving" and the portion sheet scales from there.
 *
 * A label is a table, and OCR does not return tables. It returns runs of text in whatever order
 * it found them — often the whole column of names first and the whole column of amounts after —
 * so "Total Fat" and "1.5g" can arrive twenty lines apart. Pairing them from the text alone is
 * guesswork; pairing them from where they sit on the photo is not. When the recogniser reports
 * positions, the rows are rebuilt from them first and everything below reads rows.
 *
 * It stays conservative: a value has to sit on its nutrient's row to be taken, a missing
 * nutrient stays missing rather than becoming zero, and the caller is told how much of the
 * panel was actually found.
 */
export interface LabelReading {
  servingLabel: string | null;
  macros: Partial<MacroTotals>;
  micros: MicronutrientTotals;
  /** The four macros a diary entry needs, all present. */
  complete: boolean;
}

export interface OcrFrame { left: number; top: number; width: number; height: number }
export interface OcrPoint { x: number; y: number }
export interface OcrWord { text: string; frame?: OcrFrame; cornerPoints?: readonly OcrPoint[] }
/** One recognised line, in the shape ML Kit reports it: words and all. */
export interface OcrLine extends OcrWord { elements?: readonly OcrWord[] }
export interface OcrResult { text: string; blocks?: { lines?: OcrLine[] }[] }

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

/** A rebuilt row: its text, and where along the row each character sat on the photo. */
export interface LabelRow { text: string; spans: { start: number; end: number; left: number; right: number }[] }

/** The horizontal position of one character, or null for a row that came without positions. */
function xAt(row: LabelRow, index: number): number | null {
  const span = row.spans.find(item => index >= item.start && index < item.end);
  if (!span) return null;
  return span.left + (span.right - span.left) * ((index - span.start + 0.5) / Math.max(1, span.end - span.start));
}

/**
 * The label's rows, rebuilt from where each line sits. A hand-held photo is rarely level, so the
 * page is first turned back by the median slant of its long lines — a few degrees of tilt is
 * enough to put the far end of one row at the height of the next.
 */
export function buildRows(lines: readonly OcrLine[]): LabelRow[] {
  const written = lines.filter(line => line.text.trim());
  if (!written.length || written.some(line => !line.frame || !(line.frame.height > 0))) {
    return written.map(line => ({ text: line.text.trim(), spans: [] }));
  }
  const slants = written.flatMap(line => {
    const [topLeft, topRight] = line.cornerPoints ?? [];
    const run = topRight && topLeft ? topRight.x - topLeft.x : 0;
    // Only lines long enough to measure: a two-character line's slant is mostly noise.
    return topLeft && topRight && run > line.frame!.height * 2 ? [Math.atan2(topRight.y - topLeft.y, run)] : [];
  });
  const slant = Math.max(-0.35, Math.min(0.35, median(slants)));
  const cos = Math.cos(-slant); const sin = Math.sin(-slant);
  const turn = (box: OcrWord) => {
    const frame = box.frame!;
    const [topLeft, topRight, , bottomLeft] = box.cornerPoints ?? [];
    // The frame is an upright box around a slanted line, so it overstates both of its sides.
    const height = topLeft && bottomLeft ? Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y) || frame.height : frame.height;
    const width = topLeft && topRight ? Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y) || frame.width : frame.width;
    const cx = frame.left + frame.width / 2; const cy = frame.top + frame.height / 2;
    return { x: cx * cos - cy * sin, y: cx * sin + cy * cos, width, height };
  };
  const placed = written.map(line => {
    const at = turn(line);
    const words = line.elements?.filter(word => word.text.trim()) ?? [];
    // Word boxes place every amount exactly. Without them a line is one cell, and a position
    // inside it is estimated from its characters — rough where one line mixes type sizes.
    const cells = words.length && words.every(word => word.frame && word.frame.height > 0)
      ? words.map(word => { const box = turn(word); return { text: word.text.trim(), x: box.x, width: box.width }; })
      : [{ text: line.text.trim(), x: at.x, width: at.width }];
    return { ...at, cells };
  }).sort((a, b) => a.y - b.y);
  const rows: { y: number; height: number; cells: typeof placed }[] = [];
  for (const cell of placed) {
    let best: (typeof rows)[number] | null = null;
    for (const row of rows) {
      const gap = Math.abs(row.y - cell.y);
      // Half the smaller line: "Calories" and its oversized "160" share a row, while two
      // ordinary rows, a full line apart, never do.
      if (gap <= 0.5 * Math.min(row.height, cell.height) && (!best || gap < Math.abs(best.y - cell.y))) best = row;
    }
    if (best) {
      best.cells.push(cell);
      best.y = best.cells.reduce((sum, item) => sum + item.y, 0) / best.cells.length;
      best.height = Math.min(best.height, cell.height);
    } else rows.push({ y: cell.y, height: cell.height, cells: [cell] });
  }
  return rows.sort((a, b) => a.y - b.y).map(row => {
    let text = ''; const spans: LabelRow['spans'] = [];
    for (const cell of row.cells.flatMap(line => line.cells).sort((a, b) => a.x - b.x)) {
      if (text) text += ' ';
      spans.push({ start: text.length, end: text.length + cell.text.length, left: cell.x - cell.width / 2, right: cell.x + cell.width / 2 });
      text += cell.text;
    }
    return { text, spans };
  });
}

export const rowsFromLines = (lines: readonly OcrLine[]) => buildRows(lines).map(row => row.text);

/**
 * An amount as printed. OCR reliably confuses O/0, l/I/1 and S/5 inside numbers, so those are
 * repaired — but only in a token that already holds a digit (or a lone "O" before a unit, as in
 * "Og"). Repairing letters anywhere turned the footnote's "calories a day is used" into a
 * reading of 5 calories.
 */
const AMOUNT = /(<\s*|less\s+than\s+)?([\dOolIS][\dOolIS.,]*)\s*(mcg|µg|ug|mg|g|kcal|kj|%)?(?![a-z])/gi;

function toNumber(token: string): number | null {
  const repaired = token.replace(/[.,]+$/, '').replace(/[Oo]/g, '0').replace(/[lI]/g, '1').replace(/[Ss]/g, '5');
  // "1,400mg" is a thousands separator; "0,27 mg" on an imported label is a decimal comma.
  const normal = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(repaired) ? repaired.replace(/,/g, '') : repaired.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normal)) return null;
  const value = Number(normal);
  return Number.isFinite(value) ? value : null;
}

interface Amount { value: number; index: number; end: number }
/** Every amount in a row from `from` on, skipping percentages: "Total Fat 10g 13%" is 10. */
function amountsIn(text: string, from = 0): Amount[] {
  const found: Amount[] = [];
  const pattern = new RegExp(AMOUNT.source, 'gi');
  pattern.lastIndex = from;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const [, lessThan, token, unit] = match;
    const index = match.index + (lessThan?.length ?? 0);
    // A token that starts mid-word ("B12", "Omega") is part of that word, not an amount.
    if (/[a-z]/i.test(text[match.index - 1] ?? '')) continue;
    if (!/\d/.test(token) && !(/^[Oo]$/.test(token) && unit && /g$/i.test(unit))) continue;
    if (unit === '%' || unit?.toLowerCase() === 'kj') continue;
    const value = toNumber(token);
    if (value === null) continue;
    // FDA prints "less than 1 g" for anything from 0.5 g up to 1 g, so half is the honest floor.
    found.push({ value: lessThan ? value / 2 : value, index, end: match.index + match[0].length });
  }
  return found;
}

const isBareAmount = (row: LabelRow | undefined) =>
  !!row && /^\s*(<\s*|less\s+than\s+)?[\dOolIS][\dOolIS.,]*\s*(mcg|µg|ug|mg|g)?\s*$/i.test(row.text) && amountsIn(row.text).length === 1;

type Key = keyof MacroTotals | NutrientKey;
interface Rule {
  key: Key; macro?: boolean; max: number;
  /** Tried in order: the specific spelling before the loose one. */
  labels: RegExp[];
  /** The amount can sit before the words ("Includes 10g Added Sugars"). */
  anywhere?: boolean;
  skip?: (row: string, before: string, after: string) => boolean;
}

const CALORIES: Rule = { key: 'caloriesKcal', macro: true, max: 5000, labels: [/calories(?!\s*from)/i],
  // The footnote — "2,000 calories a day", or its old table of "Calories: 2,000 2,500" — names
  // calories too, and on a photo where the real line is glare it is the only one left.
  skip: (_row, before, after) => /[\d,]\s*$/.test(before) || /2,?000\D+2,?500/.test(after) };

// "Total" is the word OCR mangles most ("Tetal", "Totai"), so it is matched by its shape.
const TOTAL = String.raw`\bt[a-z0-9]{2,3}[l1i]\.?\s*`;
const RULES: Rule[] = [
  CALORIES,
  { key: 'saturated_fat_g', max: 500, labels: [/sat(?:urated)?\.?\s*fat/i] },
  { key: 'trans_fat_g', max: 500, labels: [/trans\s*fat/i] },
  { key: 'fatG', macro: true, max: 1000, labels: [new RegExp(`${TOTAL}fat`, 'i'), /^\s*fats?\b/i] },
  { key: 'cholesterol_mg', max: 10_000, labels: [/cholest[eo]rol/i] },
  { key: 'sodium_mg', max: 50_000, labels: [/\bsod[a-z]{2,3}\b/i] },
  { key: 'fiber_g', max: 500, labels: [/fib(?:er|re)/i] },
  { key: 'added_sugar_g', max: 500, labels: [/added\s*sugars?/i], anywhere: true },
  { key: 'sugar_g', max: 500, labels: [/total\s*sugars?/i, /^\s*sugars?\b/i], skip: row => /added/i.test(row) },
  { key: 'carbsG', macro: true, max: 1000, labels: [new RegExp(`${TOTAL}carb`, 'i'), /^\s*carb/i, /\bcarbohydrates?\b/i],
    skip: row => /other\s*carb/i.test(row) },
  { key: 'proteinG', macro: true, max: 1000, labels: [/prote[ií]ns?/i] },
  { key: 'vitamin_d_mcg', max: 1000, labels: [/vit(?:amin|\.)?\s*d\b/i] },
  { key: 'potassium_mg', max: 50_000, labels: [/potassium/i] },
  { key: 'calcium_mg', max: 10_000, labels: [/calcium/i] },
  { key: 'iron_mg', max: 1000, labels: [/\biron\b/i] },
];

/**
 * The Daily Values a US label's percentages are worked from — current and pre-2020, since both
 * are still on shelves. Protein has none printed, so it is never checked.
 */
const LABEL_DAILY_VALUES: Partial<Record<Key, number[]>> = {
  fatG: [78, 65], saturated_fat_g: [20], cholesterol_mg: [300], sodium_mg: [2300, 2400],
  carbsG: [275, 300], fiber_g: [28, 25], added_sugar_g: [50], vitamin_d_mcg: [20, 10],
  calcium_mg: [1300, 1000], iron_mg: [18], potassium_mg: [4700, 3500],
};

/**
 * OCR drops decimal points: "2.7mg" reads as "27mg", and "Total Fat 1.5g" as 15 g. The label
 * printed the percentage beside the amount, so the two can be checked against each other. When
 * the amount as read disagrees with its own percentage and a tenth of it agrees, the point was
 * lost. Any other disagreement is left alone — the percentage may be the misread half.
 */
function checkedAgainstPercent(rule: Rule, text: string, amount: Amount): number {
  const values = LABEL_DAILY_VALUES[rule.key];
  const printed = /^\s*(\d{1,3})\s*%/.exec(text.slice(amount.end));
  if (!values || !printed) return amount.value;
  const percent = Number(printed[1]);
  const agrees = (value: number) => values.some(daily => Math.abs((100 * value) / daily - percent) <= Math.max(1.5, percent * 0.25));
  return !agrees(amount.value) && agrees(amount.value / 10) ? amount.value / 10 : amount.value;
}

/** Where each amount column sits, taken from the calories row: "Calories 100 220" on a label
 *  that prints per serving and per container side by side. Null for a one-column label. */
function columnsOf(rows: readonly LabelRow[]): number[] | null {
  for (const row of rows) {
    const match = CALORIES.labels[0].exec(row.text);
    if (!match) continue;
    const before = row.text.slice(0, match.index); const after = row.text.slice(match.index + match[0].length);
    if (CALORIES.skip!(row.text, before, after)) continue;
    const xs = amountsIn(row.text, match.index + match[0].length).map(amount => xAt(row, amount.index));
    if (xs.length < 2 || xs.some(x => x === null)) return null;
    return xs as number[];
  }
  return null;
}

/**
 * The first row carrying this nutrient's per-serving amount. On a two-column label only an amount
 * standing in the first column counts: when OCR loses the per-serving figure, the per-container
 * one beside it is the wrong number with nothing to say so.
 */
function read(rule: Rule, rows: readonly LabelRow[], columns: number[] | null): number | undefined {
  const inFirstColumn = (row: LabelRow, amount: Amount) => {
    const x = columns ? xAt(row, amount.index) : null;
    if (!columns || x === null) return true;
    const nearest = columns.reduce((best, column, index) => Math.abs(column - x) < Math.abs(columns[best] - x) ? index : best, 0);
    return nearest === 0;
  };
  // Row by row: the first row that names this nutrient is its row. Trying one spelling across the
  // whole label first reached the footnote's "Total Carbohydrate 300g" before the panel's own.
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    for (const label of rule.labels) {
      const match = label.exec(row.text);
      if (!match) continue;
      const before = row.text.slice(0, match.index); const after = row.text.slice(match.index + match[0].length);
      if (rule.skip?.(row.text, before, after)) continue;
      if (rule.anywhere) {
        const first = amountsIn(row.text).find(amount => inFirstColumn(row, amount));
        if (first && first.value <= rule.max) return checkedAgainstPercent(rule, row.text, first);
        continue;
      }
      // "…26g total carbohydrate (7g sugars)" is a footnote's sentence, not the carbohydrate row.
      if (/\d\s*m?c?g\s*$/i.test(before)) continue;
      const labelEnd = match.index + match[0].length;
      const found = amountsIn(row.text, labelEnd).filter(amount => {
        const gap = row.text.slice(labelEnd, amount.index);
        return !gap.includes('(') && gap.length <= 32;
      });
      const first = found.find(amount => inFirstColumn(row, amount));
      if (first && first.value <= rule.max) return checkedAgainstPercent(rule, row.text, first);
      // A name whose amount OCR put on a line of its own is paired with that line, and only that
      // line: the next row must be nothing but an amount.
      const next = rows[index + 1];
      if (!found.length && isBareAmount(next)) {
        const [amount] = amountsIn(next.text);
        if (inFirstColumn(next, amount) && amount.value <= rule.max) return amount.value;
      }
    }
  }
  return undefined;
}

/** "Energy 1000 kJ (250 kcal)" — how an imported label states calories. */
function kilocalories(rows: readonly LabelRow[]): number | undefined {
  for (const { text } of rows) {
    const match = /([\dOolIS][\dOolIS.,]*)\s*kcal\b(?!\s*diet)/i.exec(text);
    if (!match || /[a-z]/i.test(text[match.index - 1] ?? '')) continue;
    const value = toNumber(match[1]);
    if (value !== null) return value;
  }
  return undefined;
}

const SERVING = /serv(?:ing)?\.?\s*size/i;
/** "Serving size 2/3 cup (55g)", or the size on the line below its heading. */
export function servingFrom(input: string | readonly string[]): string | null {
  const rows = typeof input === 'string' ? input.split(/\r?\n/) : input;
  const tidy = (text: string) => text.split(/\b(?:amount|calories|servings)\b|[;]/i)[0]
    .replace(/^[\s:/.,-]+/, '').replace(/[\s,]+$/, '').replace(/\s+/g, ' ').slice(0, 60);
  for (let index = 0; index < rows.length; index++) {
    const match = SERVING.exec(rows[index]);
    if (!match) continue;
    const same = tidy(rows[index].slice(match.index + match[0].length));
    // A heading with no amount beside it ("Serving size/Tamaño por ración") is answered below.
    if (/\d/.test(same)) return same;
    const next = rows[index + 1] ? tidy(rows[index + 1]) : '';
    if (/\d/.test(next)) return next;
  }
  return null;
}

export function parseNutritionLabel(input: string | OcrResult): LabelReading {
  const lines = typeof input === 'string' ? [] : (input.blocks ?? []).flatMap(block => block.lines ?? []);
  const text = typeof input === 'string' ? input : input.text ?? '';
  const rows = (lines.length ? buildRows(lines) : text.replace(/\r/g, '\n').split('\n').map(line => ({ text: line, spans: [] })))
    .filter(row => row.text.trim());
  const columns = columnsOf(rows);
  const macros: Partial<MacroTotals> = {};
  const micros: MicronutrientTotals = {};
  for (const rule of RULES) {
    // Only a label with no calories line at all falls back to "kcal": one whose calories line
    // read as nonsense is refused, not rescued by a different line.
    const value = rule === CALORIES ? read(rule, rows, columns) ?? kilocalories(rows) : read(rule, rows, columns);
    if (value === undefined || value > rule.max) continue;
    if (rule.macro) macros[rule.key as keyof MacroTotals] = value;
    else micros[rule.key as NutrientKey] = value;
  }
  const complete = (['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const).every(key => typeof macros[key] === 'number');
  return { servingLabel: servingFrom(rows.map(row => row.text)), macros, micros, complete };
}

/** What is still missing, so the screen can ask for exactly that rather than "try again". */
export function missingMacros(reading: LabelReading): string[] {
  const labels: Record<keyof MacroTotals, string> = { caloriesKcal: 'calories', proteinG: 'protein', carbsG: 'carbs', fatG: 'fat' };
  return (['caloriesKcal', 'proteinG', 'carbsG', 'fatG'] as const)
    .filter(key => typeof reading.macros[key] !== 'number').map(key => labels[key]);
}
