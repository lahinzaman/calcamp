import { gramsToOz } from '../../lib/units';
import type { DailyMenuItem } from '../../types/nutrislice';
export function servingLabel(serving:DailyMenuItem['serving']) {
  if (serving.amount !== null && serving.unit && /^(g|gram|grams|kg|kilogram|kilograms)$/i.test(serving.unit)) return `${Number(gramsToOz(serving.amount * (/^k/i.test(serving.unit)?1000:1)).toFixed(2))} oz`;
  if (serving.amount !== null && serving.unit && /^(ml|milliliter|milliliters|l|liter|liters)$/i.test(serving.unit)) return `${Number((serving.amount * (/^(l|liter|liters)$/i.test(serving.unit)?1000:1) / 29.5735295625).toFixed(2))} fl oz`;
  return serving.label?.replace(/(\d+(?:\.\d+)?)\s*(g|grams?)\b/gi,(_,n)=>`${Number(gramsToOz(Number(n)).toFixed(2))} oz`) ?? 'One listed serving';
}
