import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXERCISE_CATALOG } from '../workout/catalog';
import { BIG_THREE, bigThree } from '../workout/bigThree';
import type { LiftHistory, LiftRecord } from '../workout/history';

const idOf = (name: string) => EXERCISE_CATALOG.find(exercise => exercise.name === name)!.id;
const record = (over: Partial<LiftRecord> & { exerciseId: string }): LiftRecord => ({
  lastSets: [{ weightLbs: 225, reps: 5, durationSeconds: null, distanceMeters: null }], lastPerformedMs: 1_000, bestOneRepMaxLbs: 250,
  bestWeightLbs: 225, bestSessionVolumeLbs: 5000, sessions: 3, ...over,
});

test('every lift the big three accepts actually exists in the catalogue', () => {
  for (const lift of BIG_THREE) {
    for (const name of lift.names) {
      assert.ok(EXERCISE_CATALOG.some(exercise => exercise.name === name), `${lift.key}: ${name}`);
    }
  }
});

test('each lift takes the best across its accepted variants', () => {
  const history: LiftHistory = {
    [idOf('High-Bar Back Squat')]: record({ exerciseId: idOf('High-Bar Back Squat'), bestWeightLbs: 275, bestOneRepMaxLbs: 300, sessions: 4 }),
    [idOf('Low-Bar Back Squat')]: record({ exerciseId: idOf('Low-Bar Back Squat'), bestWeightLbs: 315, bestOneRepMaxLbs: 340, sessions: 2, lastPerformedMs: 9_000 }),
  };
  const squat = bigThree(history).lifts.find(lift => lift.key === 'squat')!;
  assert.equal(squat.bestWeightLbs, 315);
  assert.equal(squat.bestOneRepMaxLbs, 340);
  assert.equal(squat.exerciseName, 'Low-Bar Back Squat');
  assert.equal(squat.sessions, 6);
  assert.equal(squat.lastPerformedMs, 9_000);
});

test('a total needs all three lifts, and stays null until it has them', () => {
  const squat = record({ exerciseId: idOf('High-Bar Back Squat'), bestWeightLbs: 315, bestOneRepMaxLbs: 345 });
  const bench = record({ exerciseId: idOf('Barbell Bench Press'), bestWeightLbs: 225, bestOneRepMaxLbs: 245 });
  const deadlift = record({ exerciseId: idOf('Conventional Deadlift'), bestWeightLbs: 405, bestOneRepMaxLbs: 430 });
  const partial = bigThree({ [squat.exerciseId]: squat, [bench.exerciseId]: bench });
  assert.equal(partial.totalLbs, null);
  assert.deepEqual(partial.missing, ['Deadlift']);
  const complete = bigThree({ [squat.exerciseId]: squat, [bench.exerciseId]: bench, [deadlift.exerciseId]: deadlift });
  assert.equal(complete.totalLbs, 945);
  assert.equal(complete.estimatedTotalLbs, 1020);
  assert.deepEqual(complete.missing, []);
});

test('lifts that are not the competition movement stay out of the total', () => {
  // Front squats, trap-bar pulls and partial-range pulls are different lifts; counting them
  // would produce a total that is not comparable to anyone else's.
  const outsiders = ['Front Squat', 'Trap-Bar Deadlift', 'Rack Pull', 'Block Pull Deadlift', 'Barbell Floor Press', 'Incline Barbell Bench Press', 'Romanian Deadlift'];
  const history: LiftHistory = Object.fromEntries(outsiders.map(name =>
    [idOf(name), record({ exerciseId: idOf(name), bestWeightLbs: 500, bestOneRepMaxLbs: 600 })]));
  const summary = bigThree(history);
  assert.deepEqual(summary.lifts, []);
  assert.equal(summary.totalLbs, null);
  assert.deepEqual(summary.missing, ['Squat', 'Bench press', 'Deadlift']);
});

test('an empty history reports nothing rather than zero', () => {
  const summary = bigThree({});
  assert.deepEqual(summary.lifts, []);
  assert.equal(summary.totalLbs, null);
  assert.equal(summary.estimatedTotalLbs, null);
});
