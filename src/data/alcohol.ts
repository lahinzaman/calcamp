import rows from './alcohol.json';
import type { MacroTotals, MicronutrientTotals } from '../types/nutrition';

/** Atwater value for ethanol, and its density, which is how a drink's energy is derived. */
export const ETHANOL_KCAL_PER_G = 7;
export const ETHANOL_DENSITY_G_PER_ML = 0.789;
/** One US standard drink is 14 g of pure ethanol. */
export const STANDARD_DRINK_G = 14;
const ML_PER_FL_OZ = 29.5735;

export type DrinkCategory = 'vodka' | 'gin' | 'rum' | 'tequila' | 'whiskey' | 'spirit' | 'liqueur' | 'beer' | 'seltzer' | 'wine';
export const DRINK_CATEGORIES: [DrinkCategory, string][] = [
  ['beer', 'Beer'], ['seltzer', 'Seltzer & RTD'], ['wine', 'Wine'], ['vodka', 'Vodka'], ['whiskey', 'Whiskey'],
  ['tequila', 'Tequila'], ['rum', 'Rum'], ['gin', 'Gin'], ['liqueur', 'Liqueurs & shots'], ['spirit', 'Other spirits'],
];
export interface Drink {
  name: string; brand: string | null; category: DrinkCategory;
  abv: number; servingMl: number;
  /** Null where the product does not publish a carbohydrate figure. */
  carbsG: number | null; fatG: number; proteinG: number;
}
export const DRINKS: Drink[] = rows as Drink[];

export const flOz = (ml: number) => Math.round((ml / ML_PER_FL_OZ) * 10) / 10;
export const alcoholGrams = (drink: Pick<Drink, 'abv' | 'servingMl'>) =>
  drink.servingMl * (drink.abv / 100) * ETHANOL_DENSITY_G_PER_ML;
export const standardDrinks = (drink: Pick<Drink, 'abv' | 'servingMl'>) => alcoholGrams(drink) / STANDARD_DRINK_G;

/**
 * Energy from the ethanol plus whatever carbohydrate, fat and protein the drink carries.
 * This is a calculation, not a label reading: it lands within a few percent for beer, wine
 * and neat spirits, and runs high for sugary liqueurs, whose labels count ethanol lower.
 */
export function drinkMacros(drink: Drink): MacroTotals {
  const carbs = drink.carbsG ?? 0;
  return {
    caloriesKcal: Math.round(alcoholGrams(drink) * ETHANOL_KCAL_PER_G + carbs * 4 + drink.fatG * 9 + drink.proteinG * 4),
    proteinG: drink.proteinG, carbsG: carbs, fatG: drink.fatG,
  };
}
export const drinkMicros = (drink: Drink): MicronutrientTotals =>
  drink.carbsG === null ? {} : { sugar_g: drink.category === 'beer' ? 0 : drink.carbsG };

export const servingLabelFor = (drink: Drink) => `${flOz(drink.servingMl)} fl oz · ${drink.abv}% ABV`;
/** Says plainly which part of the number is calculated and which part is missing. */
export function drinkNote(drink: Drink) {
  const drinks = standardDrinks(drink).toFixed(1);
  const base = `${drinks} standard drink${drinks === '1.0' ? '' : 's'} · energy calculated from ABV`;
  if (drink.carbsG === null) return `${base}. This product does not publish a carbohydrate figure, so the total is the alcohol alone and is an underestimate.`;
  if (drink.carbsG === 0) return `${base}. Unflavoured distilled spirits contain no carbohydrate.`;
  return `${base} plus its carbohydrate. Check the label — sugary drinks vary by market.`;
}

export function searchDrinks(term: string, limit = 25): Drink[] {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { drink: Drink; score: number }[] = [];
  for (const drink of DRINKS) {
    const text = `${drink.name} ${drink.brand ?? ''} ${drink.category}`.toLowerCase();
    if (!words.every(word => text.includes(word))) continue;
    // An exact prefix on the name beats a match buried in the category.
    scored.push({ drink, score: drink.name.toLowerCase().startsWith(words[0]) ? 0 : 1 });
  }
  return scored.sort((a, b) => a.score - b.score || a.drink.name.localeCompare(b.drink.name)).slice(0, limit).map(entry => entry.drink);
}
export const drinksInCategory = (category: DrinkCategory) =>
  DRINKS.filter(drink => drink.category === category).sort((a, b) => a.name.localeCompare(b.name));
