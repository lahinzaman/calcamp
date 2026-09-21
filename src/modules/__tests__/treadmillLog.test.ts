import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addSession, clearDay, prune, validateSession, MAX_DAILY_TREADMILL_STEPS } from '../quickActions/treadmillLog';

const session = (over: Partial<Parameters<typeof addSession>[2]> = {}) => ({
  steps: 4000, estimated: false, distanceMeters: 3218.7, durationSeconds: 1800, calories: 250, ...over,
});

test('two walks in a day are two walks', () => {
  let ledger = addSession({}, '2026-09-21', session());
  assert.deepEqual([ledger['2026-09-21'].steps, ledger['2026-09-21'].sessions], [4000, 1]);
  ledger = addSession(ledger, '2026-09-21', session({ steps: 2500, distanceMeters: 2000, durationSeconds: 1200, calories: 150 }));
  const day = ledger['2026-09-21'];
  assert.deepEqual([day.steps, day.sessions], [6500, 2]);
  assert.ok(Math.abs(day.distanceMeters - 5218.7) < 0.01);
  assert.equal(day.durationSeconds, 3000);
  assert.equal(day.calories, 400);
  // A different day is its own total.
  assert.equal(addSession(ledger, '2026-09-22', session())['2026-09-22'].steps, 4000);
});

test('an estimate anywhere in the day marks the whole day estimated', () => {
  // The total is then partly derived, and calling it measured would overstate what is known.
  let ledger = addSession({}, '2026-09-21', session({ estimated: false }));
  assert.equal(ledger['2026-09-21'].estimated, false);
  ledger = addSession(ledger, '2026-09-21', session({ estimated: true }));
  assert.equal(ledger['2026-09-21'].estimated, true);
  // And it does not come back off when a measured session follows.
  assert.equal(addSession(ledger, '2026-09-21', session({ estimated: false }))['2026-09-21'].estimated, true);
});

test('a session that reported no calories does not read as none burned', () => {
  const ledger = addSession({}, '2026-09-21', session({ calories: null }));
  assert.equal(ledger['2026-09-21'].calories, null, 'absent is not zero');
  // Once one session reports them, the day has a figure, made only of what was reported.
  const mixed = addSession(ledger, '2026-09-21', session({ calories: 180 }));
  assert.equal(mixed['2026-09-21'].calories, 180);
});

test('a session has to be a number of steps somebody could have taken', () => {
  assert.equal(validateSession(session()), null);
  assert.match(validateSession(session({ steps: 0 })) ?? '', /between 1 and 200,000/);
  assert.match(validateSession(session({ steps: 1.5 })) ?? '', /between 1 and 200,000/);
  assert.match(validateSession(session({ steps: 250_000 })) ?? '', /between 1 and 200,000/);
  assert.match(validateSession(session({ durationSeconds: 90_000 })) ?? '', /duration/);
  assert.match(validateSession(session({ calories: -1 })) ?? '', /calories/);
  assert.throws(() => addSession({}, '2026-09-21', session({ steps: 0 })), RangeError);
  // The day's total is capped too, so a run of bad readings cannot exceed what the column takes.
  let ledger = {};
  for (let i = 0; i < 60; i++) ledger = addSession(ledger, '2026-09-21', session({ steps: 5000 }));
  assert.equal(ledger['2026-09-21' as keyof typeof ledger], ledger['2026-09-21' as keyof typeof ledger]);
  assert.ok((ledger as Record<string, { steps: number }>)['2026-09-21'].steps <= MAX_DAILY_TREADMILL_STEPS);
});

test('a day can be taken back, and old days stop taking up room', () => {
  const ledger = addSession(addSession({}, '2026-09-21', session()), '2026-09-20', session());
  assert.deepEqual(Object.keys(clearDay(ledger, '2026-09-21')), ['2026-09-20']);
  assert.deepEqual(clearDay(ledger, '2026-01-01'), ledger, 'clearing a day with nothing in it changes nothing');

  const old = addSession(ledger, '2025-01-01', session());
  const kept = prune(old, '2026-09-21');
  assert.deepEqual(Object.keys(kept).sort(), ['2026-09-20', '2026-09-21']);
  assert.deepEqual(Object.keys(prune({ ...kept, 'not-a-date': kept['2026-09-21'] }, '2026-09-21')).sort(),
    ['2026-09-20', '2026-09-21'], 'a malformed key is dropped rather than kept forever');
});
