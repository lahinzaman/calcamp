import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { toCatalogExercise, validateCustomExercise, type CustomExercise } from '../../api/customExercises';
import { EXERCISE_CATALOG, exerciseById, fullCatalog, registerCustomExercises } from '../workout/catalog';
import { filterExercises, muscleFacets } from '../workout/search';
import { secondaryMuscles } from '../workout/synergists';
import { weeklyVolume } from '../workout/volume';

const OWNER = '20000000-0000-4000-8000-000000000001';
const ID = '90000000-0000-4000-8000-000000000001';
const mine = (over: Partial<CustomExercise> = {}): CustomExercise => ({
  id: ID, name: 'Hammer Strength Iso Row', primaryMuscle: 'upper_back',
  movementPattern: 'horizontal_pull', equipment: 'machine', trackingType: 'weight_reps',
  defaultRestSeconds: 120, ...over,
});
afterEach(() => registerCustomExercises([]));

test('an exercise is only accepted when every field it needs is one the app can act on', () => {
  assert.doesNotThrow(() => validateCustomExercise(mine()));
  assert.throws(() => validateCustomExercise(mine({ id: 'not-a-uuid' })), /identifier/);
  assert.throws(() => validateCustomExercise(mine({ name: '   ' })), /Name your exercise/);
  assert.throws(() => validateCustomExercise(mine({ name: 'x'.repeat(81) })), /1 to 80/);
  // A freeform muscle would land its sets in a weekly total that nothing reads.
  assert.throws(() => validateCustomExercise(mine({ primaryMuscle: 'delts' })), /muscle/);
  // A freeform pattern would silently stop routing assisting work.
  assert.throws(() => validateCustomExercise(mine({ movementPattern: 'pulling' })), /movement/);
  assert.throws(() => validateCustomExercise(mine({ equipment: 'kettlebell' })), /equipment/);
  assert.throws(() => validateCustomExercise(mine({ trackingType: 'reps' as never })), /measured/);
  assert.throws(() => validateCustomExercise(mine({ defaultRestSeconds: 3601 })), /Rest runs/);
  assert.throws(() => validateCustomExercise(mine({ notes: 'x'.repeat(281) })), /280/);
});

test('a created exercise behaves like any other: searchable, faceted, and it assists what it should', () => {
  const entry = toCatalogExercise(mine(), OWNER);
  assert.equal(entry.ownerUserId, OWNER);
  assert.ok(entry.description, 'a row with no subtitle would render a gap');
  registerCustomExercises([entry]);

  assert.equal(fullCatalog().length, EXERCISE_CATALOG.length + 1);
  assert.deepEqual(filterExercises(fullCatalog(), { query: 'hammer iso' }).map(e => e.id), [ID]);
  // Facets are counted from the catalogue itself, so a new lift needs no extra wiring.
  const back = muscleFacets(fullCatalog()).find(facet => facet.value === 'upper_back')!;
  assert.equal(back.count, muscleFacets(EXERCISE_CATALOG).find(facet => facet.value === 'upper_back')!.count + 1);
  // Assisting muscles come from the movement, which is why the pattern is not freeform.
  assert.deepEqual(secondaryMuscles(entry), secondaryMuscles(EXERCISE_CATALOG.find(e => e.movementPattern === 'horizontal_pull')!));

  const volume = weeklyVolume([{ exercises: [{ exerciseId: ID, sets: 4, restSeconds: 120, repLow: 6, repHigh: 12 }], timesPerWeek: 2 }], 'intermediate');
  assert.equal(volume.find(entry => entry.muscle === 'upper_back')!.sets, 8, 'its sets count toward the muscle it names');
  assert.ok(volume.find(entry => entry.muscle === 'biceps')!.partialSets > 0, 'and its assisting work is credited too');
});

test('a stored exercise ID still resolves to a name after the app restarts', () => {
  // Routines, records and history all keep IDs, not names. A custom lift has to resolve in
  // every one of them or a routine built around it reads as "Exercise" forever.
  assert.equal(exerciseById(ID), undefined);
  registerCustomExercises([toCatalogExercise(mine(), OWNER)]);
  assert.equal(exerciseById(ID)?.name, 'Hammer Strength Iso Row');
  // The shared catalogue is never shadowed by it.
  assert.equal(exerciseById(EXERCISE_CATALOG[0].id)?.name, EXERCISE_CATALOG[0].name);
  registerCustomExercises([]);
  assert.equal(exerciseById(ID), undefined, 'signing out takes another account’s exercises with it');
});

test('a hold you invented is measured in time, and contributes no phantom poundage', () => {
  const hold = toCatalogExercise(mine({ name: 'Captain of Crush Hold', trackingType: 'duration', primaryMuscle: 'forearms' }), OWNER);
  assert.equal(hold.trackingType, 'duration');
  registerCustomExercises([hold]);
  assert.equal(exerciseById(ID)?.trackingType, 'duration');
});
