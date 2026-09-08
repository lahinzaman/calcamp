export const DINING_HALLS = {
  'busch-dining-hall': 'Busch Dining Hall',
  'livingston-dining-commons': 'Livingston Dining Commons',
  'the-atrium': 'The Atrium',
  'neilson-dining-hall': 'Neilson Dining Hall',
} as const;

export type DiningHallSlug = keyof typeof DINING_HALLS;

export function isDiningHallSlug(value: unknown): value is DiningHallSlug {
  return typeof value === 'string' && Object.hasOwn(DINING_HALLS, value);
}
