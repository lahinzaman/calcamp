/** UI/domain units are Imperial. Metric conversion happens only at integration boundaries. */
export const LB_PER_KG = 1 / 0.45359237;
export const kgToLbs = (kg: number) => kg * LB_PER_KG;
export const lbsToKg = (lbs: number) => lbs * 0.45359237;
export const inchesToCm = (inches: number) => inches * 2.54;
export const cmToInches = (cm: number) => cm / 2.54;
export const gramsToOz = (grams: number) => grams / 28.349523125;
export const ozToGrams = (oz: number) => oz * 28.349523125;
export const metersToMiles = (meters: number) => meters / 1609.344;
export const feetToMeters = (feet: number) => feet * 0.3048;
export const metersToFeet = (meters: number) => meters / 0.3048;
export function heightInches(feet: number, inches: number) {
  if (!Number.isInteger(feet) || feet < 1 || feet > 8 || !Number.isFinite(inches) || inches < 0 || inches >= 12) throw new Error('Enter feet and inches (0–11.9).');
  return feet * 12 + inches;
}
export function heightLabel(inches: number) { const rounded = Math.round(inches); return `${Math.floor(rounded / 12)} ft ${rounded % 12} in`; }
