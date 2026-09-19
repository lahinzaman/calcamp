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

// --- Supersets saved into a routine, so a pairing is built once rather than every session.
import { clearRoutineSuperset, groupRoutineSuperset, pruneRoutineSupersets, routineSupersets, validateRoutine, type WorkoutRoutine } from '../workout/routines';
import { EXERCISE_CATALOG } from '../workout/catalog';
import type { RoutineExercise } from '../workout/volume';

const lift = (index: number) => EXERCISE_CATALOG[index].id;
const plan = (exerciseId: string): RoutineExercise => ({ exerciseId, sets: 3, restSeconds: 120, repLow: 6, repHigh: 12 });
const routine = (exercises: RoutineExercise[]): WorkoutRoutine => ({
  id: '11111111-1111-4111-8111-111111111111', name: 'Push A',
  exerciseIds: exercises.map(entry => entry.exerciseId), exercises, timesPerWeek: 2,
});

test('pairing in a routine moves the partners together, because that is what the pairing means', () => {
  const entries = [0, 1, 2, 3].map(index => plan(lift(index)));
  // Pair the first and the third: the second cannot stay between them.
  const paired = groupRoutineSuperset(entries, [lift(0), lift(2)], 'g1');
  assert.deepEqual(paired.map(entry => entry.exerciseId), [lift(0), lift(2), lift(1), lift(3)]);
  assert.deepEqual(routineSupersets(paired), [{ id: 'g1', exerciseIds: [lift(0), lift(2)] }]);
  assert.doesNotThrow(() => validateRoutine(routine(paired)));

  assert.throws(() => groupRoutineSuperset(entries, [lift(0)], 'g1'), /at least two/);
  assert.throws(() => groupRoutineSuperset(entries, [0, 1, 2, 3, 4].map(lift), 'g1'), /at most/);
  // Naming the same exercise twice is one exercise, not two, so it is still too small a group.
  assert.throws(() => groupRoutineSuperset(entries, [lift(0), lift(0)], 'g1'), /at least two/);
  assert.throws(() => groupRoutineSuperset(entries, [lift(0), 'not-in-this-routine'], 'g1'), /not in this routine/);

  // Joining a second group leaves the first, and a partner left alone stops being a superset.
  const moved = groupRoutineSuperset(paired, [lift(2), lift(1)], 'g2');
  assert.deepEqual(routineSupersets(moved), [{ id: 'g2', exerciseIds: [lift(2), lift(1)] }]);
  assert.deepEqual(routineSupersets(clearRoutineSuperset(moved, 'g2')), []);
  assert.deepEqual(pruneRoutineSupersets([{ ...plan(lift(0)), supersetId: 'g1' }, plan(lift(1))])[0].supersetId, undefined);
});

test('a routine cannot be saved claiming a pairing a session could never run', () => {
  const entries = [0, 1, 2].map(index => plan(lift(index)));
  // Tagged in place rather than moved: an exercise sits between the partners.
  const split = [{ ...entries[0], supersetId: 'g1' }, entries[1], { ...entries[2], supersetId: 'g1' }];
  assert.throws(() => validateRoutine(routine(split)), /sit together/);

  const lonely = [{ ...entries[0], supersetId: 'g1' }, entries[1], entries[2]];
  assert.throws(() => validateRoutine(routine(lonely)), /at least two/);

  const crowded = [0, 1, 2, 3, 4].map(index => ({ ...plan(lift(index)), supersetId: 'g1' }));
  assert.throws(() => validateRoutine(routine(crowded)), /at most/);

  assert.throws(() => validateRoutine(routine([{ ...entries[0], supersetId: '  ' }, entries[1]])), /invalid identifier/);
  // A routine saved before supersets existed carries none, and is still perfectly valid.
  assert.doesNotThrow(() => validateRoutine(routine(entries)));
  assert.deepEqual(routineSupersets(entries), []);
});

test('starting a routine re-keys its pairings onto the session’s own exercises', () => {
  const store = createWorkoutStore({ now: () => 1_000 });
  const entries = groupRoutineSuperset([0, 1, 2].map(index => plan(lift(index))), [lift(0), lift(1)], 'g1');
  const actions = () => store.getState();
  actions().startSession({ id: 'session', name: 'Push A' });

  // What ActiveWorkoutScreen does: instances are created, then the routine's groups applied.
  const instances = new Map<string, string[]>();
  entries.forEach((entry, index) => {
    const id = `slot-${index}`;
    actions().addExercise({ id, exercise: EXERCISE_CATALOG.find(e => e.id === entry.exerciseId)!, defaultRestSeconds: entry.restSeconds });
    if (entry.supersetId) instances.set(entry.supersetId, [...(instances.get(entry.supersetId) ?? []), id]);
    actions().addSet({ id: `set-${index}`, sessionExerciseId: id, weightLbs: 100, reps: 5 });
  });
  for (const [, ids] of instances) if (ids.length > 1) actions().groupSuperset(ids);

  const sequence = store.getState().exerciseSequence;
  assert.equal(sequence[0].supersetId, sequence[1].supersetId, 'the pair arrives already paired');
  assert.ok(sequence[0].supersetId);
  assert.equal(sequence[2].supersetId, undefined);

  // And it behaves like a superset without anyone pairing it again this session.
  actions().completeSet('set-0', 2_000);
  assert.equal(store.getState().restTimer, null, 'no rest between the halves');
  assert.equal(store.getState().activeExerciseId, 'slot-1');
});

// --- Editing a routine outside a session: reorder and replace, alongside pairing.
import { canMoveRoutineExercise, moveRoutineExercise, replaceRoutineExercise } from '../workout/routines';

test('reordering a routine can never split a superset', () => {
  const entries = [0, 1, 2, 3].map(index => plan(lift(index)));
  const paired = groupRoutineSuperset(entries, [lift(1), lift(2)], 'g1');
  const order = (list: RoutineExercise[]) => list.map(entry => EXERCISE_CATALOG.findIndex(e => e.id === entry.exerciseId));
  assert.deepEqual(order(paired), [0, 1, 2, 3]);

  // Moving an ungrouped exercise past a pair jumps the whole pair, not into the middle of it.
  const jumped = moveRoutineExercise(paired, lift(0), 1);
  assert.deepEqual(order(jumped), [1, 2, 0, 3]);
  assert.doesNotThrow(() => validateRoutine(routine(jumped)));

  // Moving a member against its partner reorders the pair itself.
  const swapped = moveRoutineExercise(paired, lift(2), -1);
  assert.deepEqual(order(swapped), [0, 2, 1, 3]);
  assert.equal(swapped[1].supersetId, swapped[2].supersetId, 'both are still in it');
  assert.doesNotThrow(() => validateRoutine(routine(swapped)));

  // Moving the member whose neighbour is outside the pair takes the partner along.
  const together = moveRoutineExercise(paired, lift(2), 1);
  assert.deepEqual(order(together), [0, 3, 1, 2]);
  assert.equal(together[2].supersetId, together[3].supersetId, 'the pair arrives intact');
  assert.doesNotThrow(() => validateRoutine(routine(together)));

  // The ends are a no-op, which is what disables the button rather than erroring.
  assert.deepEqual(order(moveRoutineExercise(paired, lift(0), -1)), [0, 1, 2, 3]);
  assert.equal(canMoveRoutineExercise(paired, lift(0), -1), false);
  assert.equal(canMoveRoutineExercise(paired, lift(0), 1), true);
  assert.equal(canMoveRoutineExercise(paired, lift(3), 1), false);
  assert.throws(() => moveRoutineExercise(paired, 'not-here', 1), /not in this routine/);
});

test('replacing an exercise in a routine keeps the plan that belonged to the slot', () => {
  const entries = groupRoutineSuperset([0, 1, 2].map(index => plan(lift(index))), [lift(0), lift(1)], 'g1');
  const tuned = entries.map(entry => entry.exerciseId === lift(0) ? { ...entry, sets: 5, restSeconds: 180, repLow: 3, repHigh: 5 } : entry);

  const swapped = replaceRoutineExercise(tuned, lift(0), lift(9));
  const slot = swapped[0];
  assert.equal(slot.exerciseId, lift(9));
  assert.deepEqual([slot.sets, slot.restSeconds, slot.repLow, slot.repHigh], [5, 180, 3, 5],
    'sets, rest and rep range belong to the slot, not to the lift that was filling it');
  assert.equal(slot.supersetId, 'g1', 'and so does its place in the pairing');
  assert.doesNotThrow(() => validateRoutine(routine(swapped)));

  // A routine holds distinct exercises; swapping onto one already here would merge two slots.
  assert.throws(() => replaceRoutineExercise(tuned, lift(0), lift(1)), /already in this routine/);
  assert.throws(() => replaceRoutineExercise(tuned, 'not-here', lift(9)), /not in this routine/);
  assert.throws(() => replaceRoutineExercise(tuned, lift(0), 'not-a-catalogue-id'), /not in the catalogue/);
  assert.deepEqual(replaceRoutineExercise(tuned, lift(0), lift(0)), tuned, 'swapping for itself changes nothing');
});
