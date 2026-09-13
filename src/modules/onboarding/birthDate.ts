/** A date of birth stays true as time passes; a typed age is wrong within the year. */
export const DOB_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MIN_AGE = 18;
export const MAX_AGE = 100;

export function isValidBirthDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DOB_PATTERN.test(value)) return false;
  const parsed = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

/** Whole years, counting the birthday itself as the day the age changes. */
export function ageOn(birthDate: string, on: Date = new Date()): number | null {
  if (!isValidBirthDate(birthDate)) return null;
  const [year, month, day] = birthDate.split('-').map(Number);
  let age = on.getFullYear() - year;
  const monthDelta = on.getMonth() + 1 - month;
  if (monthDelta < 0 || (monthDelta === 0 && on.getDate() < day)) age -= 1;
  return age;
}

/** The age to use, preferring a date of birth and falling back to whatever was typed before. */
export function effectiveAge(survey: { birthDate?: string | null; age?: number | null } | null | undefined, on?: Date): number | null {
  const derived = survey?.birthDate ? ageOn(survey.birthDate, on) : null;
  if (derived !== null) return derived;
  const stored = survey?.age;
  return typeof stored === 'number' && Number.isFinite(stored) ? stored : null;
}
export function birthDateProblem(value: string): string | null {
  if (!isValidBirthDate(value)) return 'Enter a date of birth as YYYY-MM-DD.';
  const age = ageOn(value);
  if (age === null || age < MIN_AGE || age > MAX_AGE) return `Automatic targets are available for adults ${MIN_AGE}–${MAX_AGE}.`;
  return null;
}
