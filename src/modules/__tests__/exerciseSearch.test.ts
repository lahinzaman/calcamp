import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXERCISE_CATALOG } from '../workout/catalog';
import { activeFilterCount, equipmentFacets, filterExercises, muscleFacets, patternFacets, patternLabel } from '../workout/search';
import { CORE_MUSCLES, MUSCLE_LABELS, volumeAdvice, weeklyVolume } from '../workout/volume';

test('every catalogue exercise is searchable and labelled', () => {
  for (const exercise of EXERCISE_CATALOG) {
    assert.ok(MUSCLE_LABELS[exercise.primaryMuscle], `no label for ${exercise.primaryMuscle}`);
    assert.notEqual(patternLabel(exercise.movementPattern ?? ''), exercise.movementPattern);
    assert.deepEqual(filterExercises(EXERCISE_CATALOG, { query: exercise.name }).some(match => match.id === exercise.id), true);
  }
  // Facet counts partition the catalogue rather than sampling it.
  for (const facets of [muscleFacets(), equipmentFacets(), patternFacets()]) {
    assert.equal(facets.reduce((total, facet) => total + facet.count, 0), EXERCISE_CATALOG.length);
  }
});

test('search narrows on every word and chips intersect across facets', () => {
  const cableRows = filterExercises(EXERCISE_CATALOG, { query: 'cable row' });
  assert.ok(cableRows.length > 0);
  for (const match of cableRows) assert.equal(match.equipment, 'cable');
  // Two words must both match: "cable row" is not "everything cable plus everything row".
  assert.ok(cableRows.length < filterExercises(EXERCISE_CATALOG, { query: 'cable' }).length);

  const chestDumbbell = filterExercises(EXERCISE_CATALOG, { muscles: ['chest'], equipment: ['dumbbell'] });
  assert.ok(chestDumbbell.length > 0);
  for (const match of chestDumbbell) { assert.equal(match.primaryMuscle, 'chest'); assert.equal(match.equipment, 'dumbbell'); }
  // Chips inside one facet are an OR.
  const either = filterExercises(EXERCISE_CATALOG, { muscles: ['chest', 'triceps'] });
  assert.equal(either.length, filterExercises(EXERCISE_CATALOG, { muscles: ['chest'] }).length
    + filterExercises(EXERCISE_CATALOG, { muscles: ['triceps'] }).length);
  assert.equal(activeFilterCount({ muscles: ['chest'], patterns: ['squat'] }), 2);
  assert.deepEqual(filterExercises(EXERCISE_CATALOG, { query: 'zzzz' }), []);
});

test('accessory muscles count when trained but are never nagged about', () => {
  const forearm = EXERCISE_CATALOG.find(exercise => exercise.primaryMuscle === 'forearms')!;
  const volume = weeklyVolume([{ exercises: [{ exerciseId: forearm.id, sets: 4, restSeconds: 90, repLow: 8, repHigh: 12 }], timesPerWeek: 2 }], 'beginner');
  assert.equal(volume.find(entry => entry.muscle === 'forearms')!.sets, 8);
  const missing = volumeAdvice(volume, 'beginner').map(item => item.text).join(' ');
  assert.ok(missing.includes('Chest'));
  assert.ok(!missing.includes('Forearms'));
  assert.ok(!(CORE_MUSCLES as readonly string[]).includes('forearms'));
});

test('a muscle that only assists counts at half a set, and never passes for direct work', () => {
  const { secondaryMuscles, PARTIAL_SET_CREDIT } = require('../workout/synergists') as typeof import('../workout/synergists');
  const bench = EXERCISE_CATALOG.find(exercise => exercise.movementPattern === 'horizontal_push')!;
  const assisting = secondaryMuscles(bench);
  assert.deepEqual(assisting, ['triceps', 'shoulders']);

  const volume = weeklyVolume([{ exercises: [{ exerciseId: bench.id, sets: 4, restSeconds: 120, repLow: 6, repHigh: 10 }], timesPerWeek: 2 }], 'intermediate');
  const chest = volume.find(entry => entry.muscle === 'chest')!;
  const triceps = volume.find(entry => entry.muscle === 'triceps')!;

  // The target is counted in full, exactly as before.
  assert.equal(chest.sets, 8);
  assert.equal(chest.partialSets, 0);
  assert.equal(chest.effectiveSets, 8);

  // Triceps did real work — a pressing routine used to report them as untrained — but not the
  // work eight sets of extensions would. They are credited at a fraction and kept apart.
  assert.equal(triceps.sets, 0, 'no direct triceps work was done');
  assert.equal(triceps.partialSets, 8);
  assert.equal(triceps.effectiveSets, 8 * PARTIAL_SET_CREDIT);
  // The verdict stays on direct sets: the targets were calibrated for them.
  assert.equal(triceps.status, 'none');
  assert.equal(triceps.frequencyOk, true, 'no direct sessions, so nothing to space out');

  // But a pressing routine no longer claims the triceps go untrained. It says they only work
  // partially, which is true, and is not the same thing.
  const advice = volumeAdvice(volume, 'intermediate').map(item => item.text);
  assert.ok(!advice.some(text => /Nothing trains[^.]*Triceps/.test(text)), 'triceps reported as untrained');
  assert.ok(advice.some(text => /Triceps[^.]*only work partially/.test(text)));
});

test('counting partial work does not tell a balanced plan it is overtraining', () => {
  // Measuring assisted sets against targets calibrated for direct sets flagged a plan of ten
  // direct sets a muscle as overtraining eight of them, because every row also credits biceps.
  const { secondaryMuscles } = require('../workout/synergists') as typeof import('../workout/synergists');
  const muscles = ['chest', 'upper_back', 'lats', 'biceps', 'triceps'];
  const schedule = [{ exercises: muscles.map(muscle => ({
    exerciseId: EXERCISE_CATALOG.find(exercise => exercise.primaryMuscle === muscle)!.id, sets: 5, restSeconds: 90, repLow: 8, repHigh: 12 })),
    timesPerWeek: 2 }];
  const volume = weeklyVolume(schedule, 'beginner');
  const biceps = volume.find(entry => entry.muscle === 'biceps')!;
  assert.ok(biceps.partialSets > 0, 'the rows really did assist the biceps');
  assert.equal(biceps.status, 'in-range', 'ten direct sets is in range, whatever assisted');
  assert.ok(secondaryMuscles(EXERCISE_CATALOG.find(exercise => exercise.primaryMuscle === 'lats')!).includes('biceps'));
});

test('an exercise never lists its own target as a muscle it partially works', () => {
  const { secondaryMuscles } = require('../workout/synergists') as typeof import('../workout/synergists');
  for (const exercise of EXERCISE_CATALOG) {
    assert.ok(!secondaryMuscles(exercise).includes(exercise.primaryMuscle), `${exercise.name} lists its own target`);
    // Every muscle named is one the app can label, so nothing renders as a raw key.
    for (const muscle of secondaryMuscles(exercise)) assert.ok(MUSCLE_LABELS[muscle], `${muscle} has no label`);
  }
  // A true isolation stays one: a leg extension works the quads and nothing else worth counting.
  const extension = EXERCISE_CATALOG.find(exercise => exercise.name === 'Leg Extension');
  if (extension) assert.deepEqual(secondaryMuscles(extension), []);
  // And a row led by the upper back names the lats, where a row led by the lats would not.
  const row = EXERCISE_CATALOG.find(exercise => exercise.movementPattern === 'horizontal_pull' && exercise.primaryMuscle === 'upper_back')!;
  assert.ok(secondaryMuscles(row).includes('lats') && !secondaryMuscles(row).includes('upper_back'));
});
