import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignSuperset, clearSuperset, groupOf, groups, nextAfterSet, prune, restsAfter, supersetLabel } from '../workout/supersets';
import { createWorkoutStore } from '../../store/workoutStore';
import type { SessionExercise, WorkoutSet } from '../../types/workout';

const slot = (id: string, supersetId?: string): SessionExercise => ({
  id, exercise: { id: `lift-${id}`, name: `Lift ${id}` }, defaultRestSeconds: 90,
  ...(supersetId ? { supersetId } : {}),
});
const set = (id: string, sessionExerciseId: string, completedAtMs: number | null = null): WorkoutSet => ({
  id, sessionExerciseId, weightLbs: 100, reps: 5, rpe: null, durationSeconds: null, distanceMeters: null,
  kind: 'normal', restSeconds: 90, estimatedOneRepMaxLbs: null, completedAtMs,
});

test('a superset sends you to the partner, and only rests once the round is done', () => {
  const sequence = [slot('a', 'g1'), slot('b', 'g1'), slot('c')];
  const sets = [set('a1', 'a'), set('a2', 'a'), set('b1', 'b'), set('b2', 'b')];

  // Finish A's first set: the partner still has work, so go there and do not start resting.
  const afterA1 = sets.map(s => s.id === 'a1' ? { ...s, completedAtMs: 1 } : s);
  assert.equal(nextAfterSet(sequence, afterA1, 'a1'), 'b');
  assert.equal(restsAfter(sequence, afterA1, 'a1'), false);

  // Finish B's first set: the round is over, A still has a set, so rest and come back.
  const afterB1 = afterA1.map(s => s.id === 'b1' ? { ...s, completedAtMs: 2 } : s);
  assert.equal(nextAfterSet(sequence, afterB1, 'b1'), 'a');
  assert.equal(restsAfter(sequence, afterB1, 'b1'), false);

  // Last set of the group: nothing is left to alternate to, so this one does rest.
  const done = afterB1.map(s => s.completedAtMs === null ? { ...s, completedAtMs: 3 } : s);
  assert.equal(nextAfterSet(sequence, done, 'b2'), null);
  assert.equal(restsAfter(sequence, done, 'b2'), true);

  // An exercise on its own always rests, which is what every exercise did before supersets.
  assert.equal(restsAfter(sequence, [set('c1', 'c', 4)], 'c1'), true);
});

test('grouping is exclusive, bounded, and a group of one is not a group', () => {
  const sequence = [slot('a'), slot('b'), slot('c'), slot('d'), slot('e')];
  const paired = assignSuperset(sequence, ['a', 'b'], 'g1');
  assert.deepEqual(groupOf(paired, 'a').map(entry => entry.id), ['a', 'b']);
  assert.equal(groupOf(paired, 'c').length, 1, 'an ungrouped exercise is its own company');

  // Joining another group leaves the first, rather than belonging to both.
  const moved = assignSuperset(paired, ['b', 'c'], 'g2');
  assert.deepEqual(groups(moved).map(group => group.members.map(m => m.id)), [['b', 'c']],
    'and the partner left behind is no longer a superset on its own');

  assert.throws(() => assignSuperset(sequence, ['a'], 'g1'), /at least two/);
  assert.throws(() => assignSuperset(sequence, ['a', 'b', 'c', 'd', 'e'], 'g1'), /at most/);
  assert.throws(() => assignSuperset(sequence, ['a', 'nope'], 'g1'), /Unknown exercise/);

  assert.deepEqual(groups(clearSuperset(paired, 'g1')), []);
  assert.deepEqual(prune([slot('a', 'g1'), slot('b')]).map(entry => entry.supersetId), [undefined, undefined]);
  assert.deepEqual([supersetLabel(0), supersetLabel(1)], ['A', 'B']);
});

test('in a live session the timer waits for the round, and removing a partner ends the pairing', () => {
  const store = createWorkoutStore({ now: () => 1_000 });
  const actions = () => store.getState();
  actions().startSession({ id: 'session', name: 'Push A' });
  for (const id of ['a', 'b', 'c']) actions().addExercise({ id, exercise: { id: `lift-${id}`, name: `Lift ${id}` }, defaultRestSeconds: 90 });
  for (const [setId, slotId] of [['a1', 'a'], ['a2', 'a'], ['b1', 'b'], ['b2', 'b']] as const) {
    actions().addSet({ id: setId, sessionExerciseId: slotId, weightLbs: 100, reps: 5 });
  }
  actions().groupSuperset(['a', 'b']);
  actions().setActiveExercise('a');

  actions().completeSet('a1', 2_000);
  assert.equal(store.getState().restTimer, null, 'no rest between the halves of a superset');
  assert.equal(store.getState().activeExerciseId, 'b', 'you are moved to the partner instead');

  actions().completeSet('b1', 3_000);
  assert.equal(store.getState().restTimer, null);
  assert.equal(store.getState().activeExerciseId, 'a', 'and back again for the second round');

  actions().completeSet('a2', 4_000);
  assert.equal(store.getState().restTimer, null);
  actions().completeSet('b2', 5_000);
  assert.equal(store.getState().restTimer?.durationSeconds, 90, 'the round is over, so now you rest');

  // A partner that leaves the session cannot leave the other suppressing its own rest forever.
  actions().removeExercise('b');
  assert.equal(store.getState().exerciseSequence.find(entry => entry.id === 'a')?.supersetId, undefined);

  assert.throws(() => actions().groupSuperset(['a']), /at least two/);
});

test('swapping an exercise keeps the slot in its superset, because the pairing is the slot', () => {
  const store = createWorkoutStore({ now: () => 1_000 });
  store.getState().startSession({ id: 'session', name: 'Push A' });
  for (const id of ['a', 'b']) store.getState().addExercise({ id, exercise: { id: `lift-${id}`, name: `Lift ${id}` }, defaultRestSeconds: 90 });
  store.getState().groupSuperset(['a', 'b'], 'g1');
  store.getState().replaceExercise('a', { id: 'lift-z', name: 'Machine Fly' });
  const swapped = store.getState().exerciseSequence.find(entry => entry.id === 'a')!;
  assert.equal(swapped.exercise.name, 'Machine Fly');
  assert.equal(swapped.supersetId, 'g1', 'the rack being busy does not dissolve the pairing');
});
