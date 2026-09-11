/** Milliseconds until the next local midnight. Uses the device calendar, never a UTC slice. */
export function msUntilLocalMidnight(now: Date): number {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid clock reading.');
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1, next.getTime() - now.getTime());
}
/**
 * setTimeout is unreliable across long sleeps and is capped near 24.8 days, so the
 * scheduler re-arms in bounded hops and re-checks the date every time it wakes.
 */
export const MAX_HOP_MS = 60 * 60 * 1000;
export function nextHopMs(now: Date) {
  return Math.min(MAX_HOP_MS, msUntilLocalMidnight(now));
}
export interface RolloverClock { setTimeout: (fn: () => void, ms: number) => unknown; clearTimeout: (handle: never) => void; now: () => Date }
/**
 * Calls `onNewDay` the first time it wakes on a calendar date later than the one it
 * started on. Waking early (a hop) or late (device asleep past midnight) both work.
 */
export function startDayRollover(currentDate: string, onNewDay: (date: string) => void, clock: RolloverClock, localDateKey: (date: Date) => string) {
  let today = currentDate;
  let handle: unknown = null;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const now = clock.now();
    const key = localDateKey(now);
    if (key !== today) { today = key; onNewDay(key); }
    handle = clock.setTimeout(tick, nextHopMs(now));
  };
  handle = clock.setTimeout(tick, nextHopMs(clock.now()));
  return {
    /** Call on app foreground: a device asleep through midnight never ran the timer. */
    check: tick,
    stop: () => { stopped = true; if (handle !== null) clock.clearTimeout(handle as never); },
  };
}
