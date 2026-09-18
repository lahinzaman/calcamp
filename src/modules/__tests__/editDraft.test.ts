import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as draft from '../workout/editDraft';
import type { CompletedWorkout } from '../../types/workout';

const END = 1_700_000_000_000;
function finished(): CompletedWorkout {
  return {
    session: { id: 'session-1', name: 'Upper A', startedAtMs: END - 3_600_000 },
    endedAtMs: END,
    exercises: [
      { id: 'slot-1', exercise: { id: 'bench', name: 'Bench Press' }, defaultRestSeconds: 120 },
      { id: 'slot-2', exercise: { id: 'row', name: 'Barbell Row' }, defaultRestSeconds: 90 },
    ],
    sets: [
      { id: 'a', sessionExerciseId: 'slot-1', weightLbs: 135, reps: 8, rpe: 7, isWarmup: false, restSeconds: 120, estimatedOneRepMaxLbs: 167.2, completedAtMs: END - 1_800_000 },
      { id: 'b', sessionExerciseId: 'slot-1', weightLbs: 155, reps: 5, rpe: 9, isWarmup: false, restSeconds: 120, estimatedOneRepMaxLbs: 174.4, completedAtMs: END - 1_500_000 },
      { id: 'c', sessionExerciseId: 'slot-2', weightLbs: 95, reps: 10, rpe: 8, isWarmup: false, restSeconds: 90, estimatedOneRepMaxLbs: 126.7, completedAtMs: END - 900_000 },
    ],
  };
}

test('a corrected set re-derives its estimated max rather than keeping the old one', () => {
  const edited = draft.editSet(finished(), 'b', { weightLbs: 225, reps: 5, rpe: 9, isWarmup: false });
  const set = edited.sets.find(entry => entry.id === 'b')!;
  assert.equal(set.weightLbs, 225);
  assert.equal(set.estimatedOneRepMaxLbs, 253.125, 'the stored estimate belonged to the number that was wrong');
  assert.equal(edited.sets.find(entry => entry.id === 'a')!.weightLbs, 135, 'and the sets either side are untouched');
  assert.throws(() => draft.editSet(finished(), 'b', { weightLbs: 100, reps: 0, rpe: null, isWarmup: false }), /whole reps/);
  assert.throws(() => draft.editSet(finished(), 'b', { weightLbs: -1, reps: 5, rpe: null, isWarmup: false }), /0 lbs or more/);
  assert.throws(() => draft.editSet(finished(), 'b', { weightLbs: 100, reps: 5, rpe: 11, isWarmup: false }), /RPE/);
});

test('a set added afterwards copies the one before it and is dated to that session, not to today', () => {
  const edited = draft.addSet(finished(), 'slot-1');
  const mine = edited.sets.filter(entry => entry.sessionExerciseId === 'slot-1');
  assert.equal(mine.length, 3);
  assert.deepEqual([mine[2].weightLbs, mine[2].reps], [155, 5], 'seeded from the last set of that exercise');
  assert.equal(mine[2].completedAtMs, finished().sets[1].completedAtMs);
  // Contiguity matters: sets are numbered by their position within the exercise on save.
  assert.deepEqual(edited.sets.map(entry => entry.sessionExerciseId), ['slot-1', 'slot-1', 'slot-1', 'slot-2']);

  const fresh = draft.addExercise(finished(), { id: 'curl', name: 'Dumbbell Curl' });
  assert.equal(fresh.exercises.length, 3);
  assert.equal(fresh.sets.filter(entry => entry.sessionExerciseId === fresh.exercises[2].id).length, 1,
    'a new exercise arrives with a row to fill in, not as an empty heading');
  assert.equal(fresh.sets.at(-1)!.completedAtMs, END);
});

test('removing an exercise takes its sets with it, and a note is trimmed or cleared', () => {
  const edited = draft.removeExercise(finished(), 'slot-1');
  assert.deepEqual(edited.exercises.map(entry => entry.id), ['slot-2']);
  assert.deepEqual(edited.sets.map(entry => entry.id), ['c'], 'no set is left pointing at an exercise that is gone');

  const noted = draft.setNote(finished(), 'slot-1', '  bench 4  ');
  assert.equal(noted.exercises[0].note, 'bench 4');
  assert.ok(!('note' in draft.setNote(noted, 'slot-1', '   ').exercises[0]), 'blanking a note removes it');
  assert.throws(() => draft.setNote(finished(), 'slot-1', 'x'.repeat(281)), RangeError);
});

test('a session cannot be saved into a state the store or the schema would reject', () => {
  assert.equal(draft.validateDraft(finished()), null);
  assert.throws(() => draft.rename(finished(), '   '), /Name this session/);
  assert.throws(() => draft.rename(finished(), 'x'.repeat(81)), /1 to 80/);

  // Emptying a session is a deletion, and has to be made as one.
  let stripped = finished();
  for (const id of ['slot-1', 'slot-2']) stripped = draft.removeExercise(stripped, id);
  assert.match(draft.validateDraft(stripped) ?? '', /Delete it instead/);

  let setless = finished();
  for (const id of ['a', 'b', 'c']) setless = draft.removeSet(setless, id);
  assert.match(draft.validateDraft(setless) ?? '', /at least one set/);

  const orphaned = { ...finished(), exercises: finished().exercises.slice(0, 1) };
  assert.match(draft.validateDraft(orphaned) ?? '', /no longer here/);
});
