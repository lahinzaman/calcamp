/**
 * The running total of treadmill sessions for a day.
 *
 * The device owns this figure and each upload replaces the day's row, rather than the server
 * adding on each write. The sync queue retries, and a write that accumulated server-side would
 * count the same session again on every retry — a walk that silently grows each time the
 * network flickers is worse than one that is briefly missing.
 */
export interface TreadmillDay {
  steps: number;
  /** Metres and seconds across every session that day, for showing what the total is made of. */
  distanceMeters: number;
  durationSeconds: number;
  calories: number | null;
  sessions: number;
  /** True when any session's steps were derived from distance rather than displayed. */
  estimated: boolean;
}
export type TreadmillLedger = Record<string, TreadmillDay>;

export interface TreadmillSession {
  steps: number;
  estimated: boolean;
  distanceMeters: number | null;
  durationSeconds: number | null;
  calories: number | null;
}

/** A day's steps cannot plausibly exceed this, and the column refuses anything above 250,000. */
export const MAX_DAILY_TREADMILL_STEPS = 200_000;

export function validateSession(session: TreadmillSession): string | null {
  if (!Number.isFinite(session.steps) || !Number.isInteger(session.steps) || session.steps < 1 || session.steps > MAX_DAILY_TREADMILL_STEPS) {
    return 'Enter a step count between 1 and 200,000.';
  }
  for (const [value, limit, label] of [
    [session.distanceMeters, 1_000_000, 'distance'], [session.durationSeconds, 86_400, 'duration'], [session.calories, 5000, 'calories'],
  ] as const) {
    if (value === null) continue;
    if (!Number.isFinite(value) || value < 0 || value > limit) return `That ${label} is not a number this can record.`;
  }
  return null;
}

/**
 * Adds a session to a day. Sessions accumulate — two walks are two walks — and an estimate
 * anywhere in the day marks the whole day's figure as estimated, because the total is then
 * partly derived and saying otherwise would overstate what is known.
 */
export function addSession(ledger: TreadmillLedger, date: string, session: TreadmillSession): TreadmillLedger {
  const problem = validateSession(session);
  if (problem) throw new RangeError(problem);
  const existing = ledger[date];
  const merged: TreadmillDay = {
    steps: Math.min(MAX_DAILY_TREADMILL_STEPS, (existing?.steps ?? 0) + session.steps),
    distanceMeters: (existing?.distanceMeters ?? 0) + (session.distanceMeters ?? 0),
    durationSeconds: (existing?.durationSeconds ?? 0) + (session.durationSeconds ?? 0),
    // Absent calories stay absent; a session that reported none must not read as zero burned.
    calories: session.calories === null && (existing?.calories ?? null) === null
      ? null : (existing?.calories ?? 0) + (session.calories ?? 0),
    sessions: (existing?.sessions ?? 0) + 1,
    estimated: (existing?.estimated ?? false) || session.estimated,
  };
  return { ...ledger, [date]: merged };
}

/** Removes a day entirely, for undoing a reading that was wrong. */
export function clearDay(ledger: TreadmillLedger, date: string): TreadmillLedger {
  const { [date]: _gone, ...rest } = ledger;
  return rest;
}

/** Days older than this are no longer editable and only take up room in the account blob. */
export const LEDGER_RETENTION_DAYS = 120;
export function prune(ledger: TreadmillLedger, today: string): TreadmillLedger {
  const cutoff = new Date(`${today}T00:00:00Z`).getTime() - LEDGER_RETENTION_DAYS * 86_400_000;
  return Object.fromEntries(Object.entries(ledger)
    .filter(([date]) => Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && Date.parse(`${date}T00:00:00Z`) >= cutoff));
}
