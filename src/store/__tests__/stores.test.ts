import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createNutritionStore, localDateKey } from '../nutritionStore';
import { createWorkoutStore, getRemainingRestSeconds } from '../workoutStore';

test('nutrition actions keep prior snapshots and caller-owned values unchanged', () => {
  const store = createNutritionStore();
  const initial = store.getState();
  const macros = { caloriesKcal: 400, proteinG: 25, carbsG: 50, fatG: 10 };
  const micros = { fiber_g: 5, sodium_mg: 300 };
  store.getState().setConsumed(macros, micros);
  const afterMeal = store.getState();
  macros.proteinG = 100;
  micros.fiber_g = 100;
  store.getState().addConsumed({ caloriesKcal: 100, proteinG: 10, carbsG: 10, fatG: 2 }, { fiber_g: 2 });

  assert.equal(initial.consumedMacros.caloriesKcal, 0);
  assert.deepEqual(initial.consumedMicros, {});
  assert.equal(afterMeal.consumedMacros.proteinG, 25);
  assert.equal(afterMeal.consumedMicros.fiber_g, 5);
  assert.equal(store.getState().consumedMicros.fiber_g, 7);
  assert.equal(store.getState().consumedMicros.sodium_mg, 300);
  assert.equal(store.getState().consumedMicros.vitamin_c_mg, undefined);
  const beforeInvalid = store.getState();
  assert.throws(() => store.getState().addConsumed({ caloriesKcal: NaN, proteinG: 0, carbsG: 0, fatG: 0 }), RangeError);
  assert.equal(store.getState(), beforeInvalid);
});

test('explicit local-day rollover clears consumed totals and adherence while retaining settings', () => {
  let now = new Date(2026, 8, 7, 23, 59);
  const store = createNutritionStore({ now: () => now });
  const targets = {
    macros: { caloriesKcal: 2000, proteinG: 100, carbsG: 250, fatG: 67 },
    micronutrients: { fiber_g: 30 },
  };
  store.getState().setDailyTargets(targets);
  store.getState().setActiveDiningHall('busch-dining-hall');
  store.getState().addConsumed({ caloriesKcal: 400, proteinG: 25, carbsG: 50, fatG: 10 });
  store.getState().setIsAdherent(true);
  const before = store.getState();
  store.getState().syncToday();
  assert.equal(store.getState(), before);
  now = new Date(2026, 8, 8, 0, 1);
  store.getState().syncToday();
  assert.equal(store.getState().date, '2026-09-08');
  assert.equal(store.getState().consumedMacros.caloriesKcal, 0);
  assert.equal(store.getState().isAdherent, false);
  assert.equal(store.getState().activeDiningHall, 'busch-dining-hall');
  assert.deepEqual(store.getState().dailyTargets, targets);
  targets.macros.caloriesKcal = 123;
  assert.equal(store.getState().dailyTargets?.macros.caloriesKcal, 2000);
  store.getState().reset();
  assert.equal(store.getState().dailyTargets, null);
  assert.equal(store.getState().activeDiningHall, null);
  assert.throws(() => localDateKey(new Date(NaN)), RangeError);
});

function workoutFixture() {
  const store = createWorkoutStore({ now: () => 1000 });
  store.getState().startSession({ id: 'workout-1', name: 'Upper A' });
  const exercise = {
    id: 'sequence-1',
    exercise: { id: 'lift-1', name: 'High-Pronated Grip Row', grip: 'pronated' },
    defaultRestSeconds: 90,
  };
  store.getState().addExercise(exercise);
  store.getState().addExercise({ ...exercise, id: 'sequence-2' });
  return { store, exercise };
}

test('logging across midnight resets yesterday atomically without clearing daily targets', () => {
  let now = new Date(2026, 8, 7, 23, 59);
  const store = createNutritionStore({ now: () => now });
  const meal = { caloriesKcal: 400, proteinG: 25, carbsG: 50, fatG: 10 };
  store.getState().addConsumed(meal, { sodium_mg: 500 });
  store.getState().setActiveDiningHall('the-atrium');
  store.getState().setIsAdherent(true);
  now = new Date(2026, 8, 8, 0, 1);
  store.getState().addConsumed(meal, { fiber_g: 5 });
  assert.equal(store.getState().date, '2026-09-08');
  assert.equal(store.getState().consumedMacros.caloriesKcal, 400);
  assert.deepEqual(store.getState().consumedMicros, { fiber_g: 5 });
  assert.equal(store.getState().isAdherent, false);
  assert.equal(store.getState().activeDiningHall, 'the-atrium');
});

test('workout inputs match the database bounds for reps, RPE, and rest seconds', () => {
  const { store } = workoutFixture();
  store.getState().addSet({ id: 'set-1', sessionExerciseId: 'sequence-1' });
  for (const update of [{ rpe: 0 }, { reps: 1001 }, { restSeconds: 1.5 }, { restSeconds: 3601 }]) {
    assert.throws(() => store.getState().updateSet('set-1', update), RangeError);
  }
  assert.throws(() => store.getState().startRestTimer(1.5), RangeError);
  store.getState().startRestTimer(0);
  assert.equal(store.getState().restTimer, null);
});

test('exercise sequence uses instance IDs and validates reorder without losing sets', () => {
  const { store, exercise } = workoutFixture();
  const before = store.getState();
  exercise.exercise.name = 'Caller mutation';
  store.getState().addSet({ id: 'set-1', sessionExerciseId: 'sequence-1', weightLbs: 40, reps: 8 });
  store.getState().reorderExercises(['sequence-2', 'sequence-1']);
  assert.equal(store.getState().exerciseSequence[1].exercise.name, 'High-Pronated Grip Row');
  assert.equal(before.exerciseSequence[0].id, 'sequence-1');
  assert.deepEqual(before.sets, []);
  assert.equal(store.getState().sets[0].sessionExerciseId, 'sequence-1');
  const valid = store.getState();
  assert.throws(() => store.getState().reorderExercises(['sequence-2', 'sequence-2']));
  assert.equal(store.getState(), valid);
  assert.throws(() => store.getState().addSet({ id: 'set-2', sessionExerciseId: 'unknown' }));
  assert.throws(() => store.getState().startSession({ id: 'workout-2', name: 'Would overwrite' }));
});

test('completing a set requires data and starts a wall-clock timer that survives background gaps', () => {
  const { store } = workoutFixture();
  store.getState().addSet({ id: 'set-1', sessionExerciseId: 'sequence-1' });
  assert.throws(() => store.getState().completeSet('set-1', 2000));
  store.getState().updateSet('set-1', { weightLbs: 40, reps: 8, rpe: 8 });
  const before = store.getState();
  store.getState().completeSet('set-1', 2000);
  const timer = store.getState().restTimer;
  assert.equal(before.sets[0].completedAtMs, null);
  assert.equal(store.getState().sets[0].completedAtMs, 2000);
  assert.equal(getRemainingRestSeconds(timer, 2000), 90);
  assert.equal(getRemainingRestSeconds(timer, 32000), 60);
  assert.equal(getRemainingRestSeconds(timer, 200000), 0);
  store.getState().completeSet('set-1', 5000);
  assert.equal(store.getState().restTimer, timer, 'Repeated completion must not restart rest.');
  store.getState().clearExpiredRestTimer(200000);
  assert.equal(store.getState().restTimer, null);
  assert.throws(() => store.getState().updateSet('set-1', { reps: null }));
});

test('removing an exercise cleans associated sets, selection, and the associated rest timer', () => {
  const { store } = workoutFixture();
  store.getState().addSet({ id: 'set-1', sessionExerciseId: 'sequence-1', weightLbs: 0, reps: 12 });
  store.getState().completeSet('set-1', 2000);
  store.getState().removeExercise('sequence-1');
  assert.equal(store.getState().activeExerciseId, 'sequence-2');
  assert.deepEqual(store.getState().sets, []);
  assert.equal(store.getState().restTimer, null);
});

test('finishing returns a detached snapshot and clears all active workout state', () => {
  const { store } = workoutFixture();
  store.getState().addSet({ id: 'set-1', sessionExerciseId: 'sequence-1', weightLbs: 40, reps: 8 });
  store.getState().completeSet('set-1', 2000);
  const before = store.getState();
  assert.throws(() => store.getState().finishSession(1500));
  const completed = store.getState().finishSession(3000);
  assert.equal(completed.endedAtMs, 3000);
  assert.equal(completed.sets[0].completedAtMs, 2000);
  assert.equal(store.getState().activeSession, null);
  assert.equal(store.getState().activeExerciseId, null);
  assert.equal(store.getState().restTimer, null);
  assert.deepEqual(store.getState().exerciseSequence, []);
  assert.deepEqual(store.getState().sets, []);
  completed.exercises[0].exercise.name = 'Caller mutation';
  assert.equal(before.exerciseSequence[0].exercise.name, 'High-Pronated Grip Row');
});

test('replacing an exercise keeps its slot and rest, and takes the old lift’s numbers with it', () => {
  const { store } = workoutFixture();
  store.getState().addSet({ id: 'set-1', sessionExerciseId: 'sequence-1', weightLbs: 135, reps: 8 });
  store.getState().addSet({ id: 'set-2', sessionExerciseId: 'sequence-1' });
  store.getState().completeSet('set-1', 2000);
  store.getState().addSet({ id: 'other', sessionExerciseId: 'sequence-2', weightLbs: 50, reps: 10 });
  store.getState().setExerciseNote('sequence-1', '  bench 4, pin 7  ');
  assert.equal(store.getState().exerciseSequence[0].note, 'bench 4, pin 7');
  assert.ok(store.getState().restTimer, 'completing a set started the rest timer');

  store.getState().replaceExercise('sequence-1', { id: 'lift-9', name: 'Chest-Supported Row' }, 120);
  const [first, second] = store.getState().exerciseSequence;
  assert.equal(first.id, 'sequence-1', 'the slot keeps its identity, so order and active tab survive');
  assert.equal(first.exercise.name, 'Chest-Supported Row');
  assert.equal(first.defaultRestSeconds, 120);
  assert.equal(first.note, undefined, 'the note described the lift that was replaced');
  assert.equal(second.exercise.name, 'High-Pronated Grip Row', 'other slots are untouched');

  const swapped = store.getState().sets.filter(s => s.sessionExerciseId === 'sequence-1');
  assert.equal(swapped.length, 2, 'the same number of sets remain to be worked through');
  assert.ok(swapped.every(s => s.weightLbs === null && s.reps === null && s.completedAtMs === null),
    'a set logged against the old lift is not re-attributed to the new one');
  assert.ok(swapped.every(s => s.restSeconds === 120));
  assert.equal(store.getState().sets.find(s => s.id === 'other')?.weightLbs, 50);
  assert.equal(store.getState().restTimer, null, 'the timer belonged to a set that no longer exists');

  assert.throws(() => store.getState().replaceExercise('nope', { id: 'lift-9', name: 'Row' }), /Unknown exercise/);
  assert.throws(() => store.getState().replaceExercise('sequence-1', { id: 'lift-9', name: '  ' }), TypeError);
  assert.throws(() => store.getState().replaceExercise('sequence-1', { id: 'lift-9', name: 'Row' }, 5000), RangeError);
});

test('an exercise note is trimmed, bounded, and cleared by blanking it', () => {
  const { store } = workoutFixture();
  store.getState().setExerciseNote('sequence-1', ' seat 3 ');
  assert.equal(store.getState().exerciseSequence[0].note, 'seat 3');
  store.getState().setExerciseNote('sequence-1', '   ');
  assert.ok(!('note' in store.getState().exerciseSequence[0]), 'a blank note is removed, not stored as whitespace');
  assert.throws(() => store.getState().setExerciseNote('sequence-1', 'x'.repeat(281)), RangeError);
  assert.throws(() => store.getState().setExerciseNote('missing', 'hi'), /Unknown exercise/);

  // A note survives into the saved workout, which is the whole point of writing it down.
  store.getState().setExerciseNote('sequence-1', 'left side lagging');
  store.getState().addSet({ id: 'set-1', sessionExerciseId: 'sequence-1', weightLbs: 100, reps: 5 });
  store.getState().completeSet('set-1', 3000);
  assert.equal(store.getState().finishSession(4000).exercises[0].note, 'left side lagging');
});
