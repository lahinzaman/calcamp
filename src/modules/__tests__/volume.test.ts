import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISE_CATALOG } from '../workout/catalog';
import { WEEKLY_SET_TARGETS, weeklyVolume, volumeAdvice, type ScheduledRoutine } from '../workout/volume';
import { defaultRoutineExercise, validateRoutine, routineExercises } from '../workout/routines';

const byMuscle = (muscle: string) => EXERCISE_CATALOG.find(e => e.primaryMuscle === muscle)!.id;
const chest = byMuscle('chest'); const lats = byMuscle('lats'); const quads = byMuscle('quadriceps');
const plan = (exerciseId: string, sets: number) => ({ ...defaultRoutineExercise(exerciseId), sets });

test('weekly sets multiply by how often a routine runs, and count only the primary mover', () => {
  const schedule: ScheduledRoutine[] = [{ exercises: [plan(chest, 3), plan(lats, 3)], timesPerWeek: 2 }];
  const volume = weeklyVolume(schedule, 'beginner');
  const chestRow = volume.find(entry => entry.muscle === 'chest')!;
  assert.equal(chestRow.sets, 6);
  assert.equal(chestRow.frequency, 2);
  assert.equal(chestRow.frequencyOk, true);
  // Untrained muscles are reported, not omitted, so gaps are visible.
  assert.equal(volume.find(entry => entry.muscle === 'calves')!.sets, 0);
  assert.equal(volume.find(entry => entry.muscle === 'calves')!.status, 'none');
});

test('set targets follow the experience level', () => {
  assert.deepEqual(WEEKLY_SET_TARGETS.beginner, [10, 12]);
  assert.deepEqual(WEEKLY_SET_TARGETS.intermediate, [8, 10]);
  assert.deepEqual(WEEKLY_SET_TARGETS.advanced, [4, 12]);
  const schedule: ScheduledRoutine[] = [{ exercises: [plan(chest, 5)], timesPerWeek: 2 }];
  // Ten sets: on target for a beginner, over the cap for an intermediate.
  assert.equal(weeklyVolume(schedule, 'beginner').find(e => e.muscle === 'chest')!.status, 'in-range');
  assert.equal(weeklyVolume(schedule, 'intermediate').find(e => e.muscle === 'chest')!.status, 'in-range');
  assert.equal(weeklyVolume([{ exercises: [plan(chest, 7)], timesPerWeek: 2 }], 'intermediate').find(e => e.muscle === 'chest')!.status, 'over');
  assert.equal(weeklyVolume([{ exercises: [plan(chest, 2)], timesPerWeek: 1 }], 'beginner').find(e => e.muscle === 'chest')!.status, 'under');
  assert.equal(weeklyVolume([{ exercises: [plan(chest, 2)], timesPerWeek: 2 }], 'advanced').find(e => e.muscle === 'chest')!.status, 'in-range');
});

test('training a muscle once a week is flagged even when the set total is fine', () => {
  const schedule: ScheduledRoutine[] = [{ exercises: [plan(chest, 11)], timesPerWeek: 1 }];
  const volume = weeklyVolume(schedule, 'beginner');
  const chestRow = volume.find(entry => entry.muscle === 'chest')!;
  assert.equal(chestRow.status, 'in-range');
  assert.equal(chestRow.frequencyOk, false);
  const advice = volumeAdvice(volume, 'beginner');
  assert.ok(advice.some(item => /once a week/.test(item.text)));
});

test('a balanced plan is told it is balanced rather than nagged', () => {
  const schedule: ScheduledRoutine[] = [{
    exercises: Object.keys({ chest: 1, upper_back: 1, lats: 1, shoulders: 1, rear_delts: 1, biceps: 1, triceps: 1,
      quadriceps: 1, hamstrings: 1, glutes: 1, calves: 1, abdominals: 1 }).map(muscle => plan(byMuscle(muscle), 5)),
    timesPerWeek: 2,
  }];
  const volume = weeklyVolume(schedule, 'beginner');
  const advice = volumeAdvice(volume, 'beginner');
  assert.equal(advice.length, 1);
  assert.equal(advice[0].tone, 'good');
  assert.equal(volumeAdvice(weeklyVolume([], 'beginner'), 'beginner')[0].tone, 'warn');
});

test('routine details must line up with their exercise ids and stay inside sane bounds', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const base = { id, name: 'Push A', exerciseIds: [chest, quads] };
  validateRoutine({ ...base, exercises: [defaultRoutineExercise(chest), defaultRoutineExercise(quads)], timesPerWeek: 2 });
  // A plan in a different order than the ids would silently mis-assign sets.
  assert.throws(() => validateRoutine({ ...base, exercises: [defaultRoutineExercise(quads), defaultRoutineExercise(chest)] }));
  assert.throws(() => validateRoutine({ ...base, exercises: [defaultRoutineExercise(chest)] }));
  assert.throws(() => validateRoutine({ ...base, exercises: [{ ...defaultRoutineExercise(chest), sets: 0 }, defaultRoutineExercise(quads)] }));
  assert.throws(() => validateRoutine({ ...base, exercises: [{ ...defaultRoutineExercise(chest), restSeconds: 601 }, defaultRoutineExercise(quads)] }));
  assert.throws(() => validateRoutine({ ...base, exercises: [{ ...defaultRoutineExercise(chest), repLow: 12, repHigh: 6 }, defaultRoutineExercise(quads)] }));
  assert.throws(() => validateRoutine({ ...base, timesPerWeek: 8 }));
  // A routine saved before per-exercise detail existed still opens, with defaults.
  assert.deepEqual(routineExercises(base), [defaultRoutineExercise(chest), defaultRoutineExercise(quads)]);
});

test('coaching fires on the user own data and puts frequency before volume', () => {
  const { coachingTips } = require('../workout/coaching') as typeof import('../workout/coaching');
  const base = { experience: 'beginner' as const, sessionsThisWeek: 3, stalledSessions: 0, averageRpe: 8,
    proteinPerLb: 0.9, intendedWeeklyChangeLbs: 0, daysSinceWeighIn: 1, shortestRestSeconds: 120 };
  const once = weeklyVolume([{ exercises: [plan(chest, 11)], timesPerWeek: 1 }], 'beginner');
  const tips = coachingTips({ ...base, volume: once });
  // Frequency outranks everything else when the set total is already fine.
  assert.equal(tips[0].id, 'frequency');

  const stalled = coachingTips({ ...base, volume: weeklyVolume([{ exercises: [plan(chest, 5)], timesPerWeek: 2 }], 'beginner'), stalledSessions: 4 });
  assert.ok(stalled.some(tip => tip.id === 'stall'));

  const lowProtein = coachingTips({ ...base, volume: once, proteinPerLb: 0.4, intendedWeeklyChangeLbs: -1 });
  const protein = lowProtein.find(tip => tip.id === 'protein')!;
  assert.ok(protein, 'low protein should be raised');
  assert.match(protein.body, /deficit/);

  // Signals the app cannot measure yet must not invent a tip.
  const unknown = coachingTips({ ...base, volume: once, averageRpe: null, proteinPerLb: null, daysSinceWeighIn: null, shortestRestSeconds: null });
  for (const id of ['rpe-high', 'rpe-low', 'protein', 'weigh-in', 'rest']) assert.equal(unknown.some(tip => tip.id === id), false, id);

  assert.ok(coachingTips({ ...base, volume: once, daysSinceWeighIn: 9 }).some(tip => tip.id === 'weigh-in'));
  assert.ok(coachingTips({ ...base, volume: once, averageRpe: 9.8 }).some(tip => tip.id === 'rpe-high'));
  assert.ok(coachingTips({ ...base, volume: once, shortestRestSeconds: 30 }).some(tip => tip.id === 'rest'));
});

