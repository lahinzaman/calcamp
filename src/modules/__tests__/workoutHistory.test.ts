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

test('plate loading is per side, greedy, and honest about what the rack cannot make', () => {
  const { loadPlates, describePlates } = require('../workout/plates') as typeof import('../workout/plates');
  const plan = loadPlates(225)!;
  assert.deepEqual(plan.perSide, [45, 45]);
  assert.equal(plan.achieved, 225);
  assert.equal(plan.remainder, 0);
  assert.equal(describePlates(plan), '2×45 per side = 225 lbs');
  // 137.5 is not loadable on a standard rack; report the shortfall rather than rounding silently.
  const odd = loadPlates(137.5)!;
  assert.equal(odd.achieved, 135);
  assert.equal(odd.remainder, 2.5);
  assert.equal(loadPlates(45)!.perSide.length, 0);
  assert.equal(describePlates(loadPlates(45)), 'Just the bar — 45 lbs.');
  assert.equal(loadPlates(30)!.achieved, 45);
  assert.equal(loadPlates(Number.NaN), null);
});

test('a cancelled session reaches neither history nor the upload queue', () => {
  const { workoutStore } = require('../../store/workoutStore') as typeof import('../../store/workoutStore');
  const store = workoutStore.getState();
  store.reset();
  store.startSession({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', name: 'Push A' });
  store.addExercise({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', exercise: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', name: 'Bench' }, defaultRestSeconds: 120 });
  store.addSet({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', sessionExerciseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' });
  store.updateSet('dddddddd-dddd-4ddd-8ddd-dddddddddd01', { weightLbs: 185, reps: 5 });
  store.completeSet('dddddddd-dddd-4ddd-8ddd-dddddddddd01');
  assert.equal(workoutStore.getState().sets.length, 1);

  workoutStore.getState().cancelSession();
  const after = workoutStore.getState();
  assert.equal(after.activeSession, null);
  assert.deepEqual(after.sets, []);
  assert.deepEqual(after.exerciseSequence, []);
  // Finishing queues a workout; cancelling must not, or the session lands in history anyway.
  assert.deepEqual(after.pendingWorkouts, []);
  assert.throws(() => workoutStore.getState().cancelSession(), /session/i, 'there is nothing to cancel twice');
  workoutStore.getState().reset();
});

test('cancelling keeps workouts that were already finished and waiting to upload', () => {
  const { workoutStore } = require('../../store/workoutStore') as typeof import('../../store/workoutStore');
  const store = workoutStore.getState();
  store.reset();
  store.startSession({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', name: 'Finished' });
  store.finishSession();
  assert.equal(workoutStore.getState().pendingWorkouts.length, 1);
  workoutStore.getState().startSession({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03', name: 'Abandoned' });
  workoutStore.getState().cancelSession();
  assert.equal(workoutStore.getState().pendingWorkouts.length, 1, 'an earlier session is not collateral');
  workoutStore.getState().reset();
});
