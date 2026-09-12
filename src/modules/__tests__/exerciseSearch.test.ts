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
