import type { HistoryDay } from '../../api/history';
import type { FoodEntry } from '../../types/foodEntry';
/** RFC 4180: quote every field and double embedded quotes, so commas in food names survive. */
export function toCsv(rows: readonly (readonly (string | number | null)[])[]) {
  return rows.map(row => row.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
export function daysCsv(days: readonly HistoryDay[]) {
  return toCsv([['date', 'calories_kcal', 'protein_g', 'carbs_g', 'fat_g', 'body_weight_lbs', 'adherent'],
    ...days.map(day => [day.log_date, day.calories_kcal, day.proteinG, day.carbsG, day.fatG, day.body_weight_lbs, day.is_adherent ? 'yes' : 'no'])]);
}
export function entriesCsv(entries: readonly FoodEntry[]) {
  return toCsv([['date', 'meal', 'food', 'servings', 'serving', 'calories_kcal', 'protein_g', 'carbs_g', 'fat_g', 'source'],
    ...entries.map(entry => [entry.date, entry.meal, entry.name, entry.servings, entry.servingLabel, entry.macros.caloriesKcal,
      entry.macros.proteinG, entry.macros.carbsG, entry.macros.fatG, entry.source])]);
}
