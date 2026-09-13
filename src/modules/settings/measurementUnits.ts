import { durableStorage } from '../sync/storage';
import { cmToInches, gramsToOz, inchesToCm, kgToLbs, lbsToKg, ozToGrams } from '../../lib/units';

/**
 * Stored values stay Imperial everywhere — this only changes what is shown and what a typed
 * number means. Converting the stored data would rewrite history every time someone flips a
 * switch, and any rounding would compound.
 */
export type UnitSystem = 'imperial' | 'metric';
export const UNIT_SYSTEMS: [UnitSystem, string][] = [['imperial', 'Imperial · lbs, in, oz'], ['metric', 'Metric · kg, cm, g']];
const KEY = 'unit-system';
export const DEFAULT_UNITS: UnitSystem = 'imperial';

export function readUnits(): UnitSystem {
  try { return durableStorage.get(KEY) === 'metric' ? 'metric' : DEFAULT_UNITS; } catch { return DEFAULT_UNITS; }
}
export function writeUnits(system: UnitSystem): UnitSystem {
  const chosen: UnitSystem = system === 'metric' ? 'metric' : 'imperial';
  try { durableStorage.set(KEY, chosen); } catch { /* the preference is cosmetic */ }
  return chosen;
}

const round = (value: number, places = 1) => Number(value.toFixed(places));

export const weightUnit = (system: UnitSystem) => system === 'metric' ? 'kg' : 'lbs';
export const lengthUnit = (system: UnitSystem) => system === 'metric' ? 'cm' : 'in';
export const massUnit = (system: UnitSystem) => system === 'metric' ? 'g' : 'oz';

/** Display a stored pound value in the chosen system. */
export const showWeight = (lbs: number, system: UnitSystem, places = 1) =>
  round(system === 'metric' ? lbs / kgToLbs(1) : lbs, places);
export const weightLabel = (lbs: number, system: UnitSystem, places = 1) =>
  `${showWeight(lbs, system, places)} ${weightUnit(system)}`;
/** Turn a number typed in the chosen system back into stored pounds. */
export const readWeight = (value: number, system: UnitSystem) =>
  system === 'metric' ? kgToLbs(value) : value;

export const showLength = (inches: number, system: UnitSystem, places = 1) =>
  round(system === 'metric' ? inchesToCm(inches) : inches, places);
export const readLength = (value: number, system: UnitSystem) =>
  system === 'metric' ? cmToInches(value) : value;
/** Feet and inches mean nothing in a metric country; centimetres are one number. */
export function heightLabelFor(inches: number, system: UnitSystem) {
  if (system === 'metric') return `${Math.round(inchesToCm(inches))} cm`;
  const rounded = Math.round(inches);
  return `${Math.floor(rounded / 12)} ft ${rounded % 12} in`;
}

export const showMass = (oz: number, system: UnitSystem, places = 1) =>
  round(system === 'metric' ? ozToGrams(oz) : oz, places);
export const readMass = (value: number, system: UnitSystem) =>
  system === 'metric' ? gramsToOz(value) : value;
export const massLabel = (oz: number, system: UnitSystem, places = 1) =>
  `${showMass(oz, system, places)} ${massUnit(system)}`;
