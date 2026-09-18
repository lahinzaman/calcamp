import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describePrevious, isHardSet, missingFor, normalizeSet, outOfRange, setVolumeLbs, supportsOneRepMax, SET_SHAPES } from '../workout/setShape';
import { trackingTypeFor } from '../workout/trackingTypes';
import { EXERCISE_CATALOG } from '../workout/catalog';
import type { WorkoutSet } from '../../types/workout';

const set = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: 's', sessionExerciseId: 'e', weightLbs: null, reps: null, rpe: null,
  durationSeconds: null, distanceMeters: null, kind: 'normal', restSeconds: 90,
  estimatedOneRepMaxLbs: null, completedAtMs: 1, ...over,
});

test('each tracking type asks for what it is actually measured in', () => {
  assert.equal(missingFor(set({ weightLbs: 135, reps: 5 }), 'weight_reps'), null);
  assert.match(missingFor(set({ reps: 5 }), 'weight_reps') ?? '', /weight/);
  // A pull-up is reps; the weight you hang off a belt is extra, not required.
  assert.equal(missingFor(set({ reps: 8 }), 'bodyweight_reps'), null);
  assert.equal(missingFor(set({ reps: 8, weightLbs: 25 }), 'bodyweight_reps'), null);
  assert.match(missingFor(set({ weightLbs: 25 }), 'bodyweight_reps') ?? '', /reps/);
  assert.equal(missingFor(set({ durationSeconds: 90 }), 'duration'), null);
  assert.match(missingFor(set({ reps: 1 }), 'duration') ?? '', /how long/);
  assert.equal(missingFor(set({ distanceMeters: 40 }), 'distance_duration'), null);
  assert.match(missingFor(set({ durationSeconds: 30 }), 'distance_duration') ?? '', /distance/);
});

test('volume is external load across reps, and nothing else pretends to be it', () => {
  assert.equal(setVolumeLbs(set({ weightLbs: 100, reps: 5 }), 'weight_reps'), 500);
  // Body mass is not external load, so an unweighted pull-up moves nothing measurable...
  assert.equal(setVolumeLbs(set({ reps: 8 }), 'bodyweight_reps'), 0);
  // ...but a belt full of plates does.
  assert.equal(setVolumeLbs(set({ reps: 8, weightLbs: 25 }), 'bodyweight_reps'), 200);
  // Time under tension and ground covered are real work, but they are not lbs moved.
  assert.equal(setVolumeLbs(set({ durationSeconds: 90 }), 'duration'), 0);
  assert.equal(setVolumeLbs(set({ distanceMeters: 40, weightLbs: 70 }), 'distance_duration'), 0);
  // A warm-up never counts, and neither does a set that was never completed.
  assert.equal(setVolumeLbs(set({ weightLbs: 100, reps: 5, kind: 'warmup' }), 'weight_reps'), 0);
  assert.equal(setVolumeLbs(set({ weightLbs: 100, reps: 5, completedAtMs: null }), 'weight_reps'), 0);
  // A drop set and a set to failure are work you have to recover from. They count.
  assert.equal(setVolumeLbs(set({ weightLbs: 100, reps: 5, kind: 'drop' }), 'weight_reps'), 500);
  assert.equal(setVolumeLbs(set({ weightLbs: 100, reps: 5, kind: 'failure' }), 'weight_reps'), 500);
  assert.deepEqual([isHardSet(set({ kind: 'warmup' })), isHardSet(set({ kind: 'drop' }))], [false, true]);
  assert.deepEqual(['weight_reps', 'bodyweight_reps', 'duration', 'distance_duration'].map(t => supportsOneRepMax(t as never)),
    [true, true, false, false]);
});

test('bounds match the database, so a set the app takes is one the schema will take', () => {
  assert.equal(outOfRange(set({ weightLbs: 0, reps: 1 })), null);
  assert.match(outOfRange(set({ weightLbs: -1 })) ?? '', /0 lbs or more/);
  assert.match(outOfRange(set({ reps: 1001 })) ?? '', /1 to 1000/);
  assert.match(outOfRange(set({ reps: 1.5 })) ?? '', /whole reps/);
  assert.match(outOfRange(set({ rpe: 10.5 })) ?? '', /RPE/);
  assert.match(outOfRange(set({ durationSeconds: 0 })) ?? '', /1 second/);
  assert.match(outOfRange(set({ durationSeconds: 86_401 })) ?? '', /1 second/);
  assert.match(outOfRange(set({ distanceMeters: 0 })) ?? '', /1 m/);
});

test('the previous column reads the way a lifter would say it', () => {
  assert.equal(describePrevious({ weightLbs: 90, reps: 5, durationSeconds: null, distanceMeters: null }, 'weight_reps'), '90 × 5');
  assert.equal(describePrevious({ weightLbs: null, reps: 8, durationSeconds: null, distanceMeters: null }, 'bodyweight_reps'), '8 reps');
  assert.equal(describePrevious({ weightLbs: 25, reps: 8, durationSeconds: null, distanceMeters: null }, 'bodyweight_reps'), '+25 × 8');
  assert.equal(describePrevious({ weightLbs: null, reps: null, durationSeconds: 90, distanceMeters: null }, 'duration'), '1:30');
  assert.equal(describePrevious({ weightLbs: null, reps: null, durationSeconds: 45, distanceMeters: null }, 'duration'), '45s');
  assert.equal(describePrevious({ weightLbs: null, reps: null, durationSeconds: 30, distanceMeters: 40 }, 'distance_duration'), '40 m · 30s');
  assert.equal(describePrevious({ weightLbs: null, reps: null, durationSeconds: null, distanceMeters: null }, 'duration'), '—');
});

test('a set stored before sets had a kind comes back as the kind it was', () => {
  const legacy = { id: 's', sessionExerciseId: 'e', weightLbs: 100, reps: 5, rpe: null,
    isWarmup: true, restSeconds: 90, estimatedOneRepMaxLbs: null, completedAtMs: 1 } as unknown as WorkoutSet;
  const migrated = normalizeSet(legacy);
  assert.equal(migrated.kind, 'warmup');
  assert.deepEqual([migrated.durationSeconds, migrated.distanceMeters], [null, null]);
  assert.ok(!('isWarmup' in migrated), 'the old flag does not survive alongside the field that replaced it');
  assert.equal(normalizeSet({ ...legacy, isWarmup: false } as never).kind, 'normal');
});

test('the catalogue measures holds in time and carries in distance, and everything else as before', () => {
  const byName = (name: string) => EXERCISE_CATALOG.find(exercise => exercise.name === name)!;
  assert.equal(byName('Plank').trackingType, 'duration');
  assert.equal(byName('Side Plank').trackingType, 'duration');
  assert.equal(byName('Farmer Carry').trackingType, 'distance_duration');
  assert.equal(byName('Pull-Up').trackingType, 'bodyweight_reps');
  assert.equal(byName('High-Bar Back Squat').trackingType, 'weight_reps');
  // Nothing loaded changed meaning: the default is what the whole catalogue used to be.
  assert.equal(trackingTypeFor({ name: 'Anything New', equipment: 'barbell' }), 'weight_reps');
  const shapes = EXERCISE_CATALOG.filter(exercise => SET_SHAPES[exercise.trackingType!].countsVolume);
  assert.ok(shapes.length > EXERCISE_CATALOG.length - 15, 'only a handful of lifts are not weight-and-reps work');
});
