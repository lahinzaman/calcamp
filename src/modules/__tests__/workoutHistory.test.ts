import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectRecords, overloadSuggestion, recordWorkout, sessionVolume, dateKeyOf } from '../workout/history';
import type { CompletedWorkout } from '../../types/workout';

const set = (over: Partial<CompletedWorkout['sets'][number]> = {}) => ({
  id: 's1', sessionExerciseId: 'e1', weightLbs: 135, reps: 8, rpe: 8, isWarmup: false,
  restSeconds: 120, estimatedOneRepMaxLbs: 167, completedAtMs: 1000, ...over,
});
const workout = (sets: CompletedWorkout['sets']): CompletedWorkout => ({
  session: { id: 'w1', name: 'Upper A', startedAtMs: 0 },
  endedAtMs: 1_700_000_000_000, sets,
  exercises: [{ id: 'e1', exercise: { id: 'bench', name: 'Bench' }, defaultRestSeconds: 120 }],
});

test('recording a session keeps working sets only and accumulates bests', () => {
  const first = recordWorkout({}, workout([set(), set({ id: 's2', weightLbs: 145, reps: 6, estimatedOneRepMaxLbs: 170 }), set({ id: 'w', isWarmup: true, weightLbs: 45 }), set({ id: 'x', completedAtMs: null })]));
  assert.equal(first.bench.lastSets.length, 2);
  assert.equal(first.bench.bestWeightLbs, 145);
  assert.equal(first.bench.bestOneRepMaxLbs, 170);
  assert.equal(first.bench.sessions, 1);
  // A lighter later session must not lower an existing best.
  const second = recordWorkout(first, workout([set({ weightLbs: 100, reps: 5, estimatedOneRepMaxLbs: 112 })]));
  assert.equal(second.bench.bestWeightLbs, 145);
  assert.equal(second.bench.sessions, 2);
  assert.deepEqual(second.bench.lastSets, [{ weightLbs: 100, reps: 5 }]);
});

test('personal records compare against history before the session, so a repeat is not a record', () => {
  const history = recordWorkout({}, workout([set()]));
  assert.deepEqual(detectRecords(history, workout([set()])), []);
  const beaten = detectRecords(history, workout([set({ weightLbs: 155, estimatedOneRepMaxLbs: 180 })]));
  assert.equal(beaten.length, 2);
  assert.equal(beaten.find(r => r.kind === 'weight')!.previous, 135);
  // A first-ever session is a record against nothing.
  assert.equal(detectRecords({}, workout([set()])).length, 2);
});

test('overload adds reps inside the range, then weight once the top is held', () => {
  const low = overloadSuggestion({ exerciseId: 'bench', lastSets: [{ weightLbs: 135, reps: 8 }], lastPerformedMs: 0, bestOneRepMaxLbs: 0, bestWeightLbs: 135, bestSessionVolumeLbs: 0, sessions: 1 });
  assert.deepEqual([low!.weightLbs, low!.reps], [135, 9]);
  const top = overloadSuggestion({ exerciseId: 'bench', lastSets: [{ weightLbs: 135, reps: 12 }], lastPerformedMs: 0, bestOneRepMaxLbs: 0, bestWeightLbs: 135, bestSessionVolumeLbs: 0, sessions: 1 });
  assert.deepEqual([top!.weightLbs, top!.reps], [140, 6]);
  const heavy = overloadSuggestion({ exerciseId: 'squat', lastSets: [{ weightLbs: 225, reps: 12 }], lastPerformedMs: 0, bestOneRepMaxLbs: 0, bestWeightLbs: 225, bestSessionVolumeLbs: 0, sessions: 1 });
  assert.equal(heavy!.weightLbs, 235);
  assert.equal(overloadSuggestion(undefined), null);
});

test('session volume counts completed working sets only', () => {
  assert.equal(sessionVolume(workout([set(), set({ id: 'w', isWarmup: true, weightLbs: 45, reps: 10 })])), 135 * 8);
  assert.equal(dateKeyOf(Date.UTC(2026, 8, 11, 12)).length, 10);
});
