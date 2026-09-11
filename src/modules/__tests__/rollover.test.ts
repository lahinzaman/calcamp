import assert from 'node:assert/strict';
import { test } from 'node:test';
import { msUntilLocalMidnight, nextHopMs, startDayRollover, MAX_HOP_MS } from '../nutrition/rollover';
import { localDateKey } from '../../store/nutritionStore';

test('time to midnight is measured on the local calendar, not a UTC slice', () => {
  const evening = new Date(2026, 8, 11, 23, 30, 0);
  assert.equal(msUntilLocalMidnight(evening), 30 * 60 * 1000);
  const morning = new Date(2026, 8, 11, 0, 0, 1);
  assert.equal(msUntilLocalMidnight(morning), 24 * 60 * 60 * 1000 - 1000);
  // Exactly midnight belongs to the new day already, so the next boundary is a full day out.
  assert.equal(msUntilLocalMidnight(new Date(2026, 8, 11, 0, 0, 0)), 24 * 60 * 60 * 1000);
  assert.throws(() => msUntilLocalMidnight(new Date(Number.NaN)));
});

test('the scheduler hops in bounded steps rather than sleeping for a whole day', () => {
  assert.equal(nextHopMs(new Date(2026, 8, 11, 3, 0, 0)), MAX_HOP_MS);
  assert.equal(nextHopMs(new Date(2026, 8, 11, 23, 45, 0)), 15 * 60 * 1000);
});

test('rollover fires once per new day, whether the timer wakes early or late', () => {
  let now = new Date(2026, 8, 11, 23, 0, 0);
  const pending: (() => void)[] = [];
  const clock = { setTimeout: (fn: () => void) => { pending.push(fn); return pending.length; }, clearTimeout: () => {}, now: () => now };
  const rolled: string[] = [];
  startDayRollover(localDateKey(now), date => rolled.push(date), clock, localDateKey);

  // A hop before midnight changes nothing.
  now = new Date(2026, 8, 11, 23, 59, 0);
  pending.pop()!();
  assert.deepEqual(rolled, []);

  // Waking after midnight rolls over exactly once.
  now = new Date(2026, 8, 12, 0, 0, 5);
  pending.pop()!();
  assert.deepEqual(rolled, ['2026-09-12']);
  now = new Date(2026, 8, 12, 1, 0, 0);
  pending.pop()!();
  assert.deepEqual(rolled, ['2026-09-12'], 'must not fire twice for the same day');

  // A device asleep through a whole day still rolls over on the next wake.
  now = new Date(2026, 8, 14, 9, 0, 0);
  pending.pop()!();
  assert.deepEqual(rolled, ['2026-09-12', '2026-09-14']);
});

test('a stopped scheduler does not fire again', () => {
  let now = new Date(2026, 8, 11, 23, 0, 0);
  const pending: (() => void)[] = [];
  const clock = { setTimeout: (fn: () => void) => { pending.push(fn); return pending.length; }, clearTimeout: () => {}, now: () => now };
  const rolled: string[] = [];
  const rollover = startDayRollover(localDateKey(now), date => rolled.push(date), clock, localDateKey);
  rollover.stop();
  now = new Date(2026, 8, 12, 0, 30, 0);
  pending.pop()!();
  assert.deepEqual(rolled, []);
});
