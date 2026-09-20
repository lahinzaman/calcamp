import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isUuid, repairIdentifiers, SyncEngine, type AccountData } from '../sync/engine';
import { memoryStorage } from '../sync/storage';
import { validateRoutine } from '../workout/routines';
import { EXERCISE_CATALOG } from '../workout/catalog';

/** Exactly what the old generator produced once `globalThis.crypto` turned out not to exist. */
const legacyId = (seed: number) => `${(1_700_000_000_000 + seed).toString(16)}-0000-4000-8000-000000000000`.slice(0, 36);
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
/** A real shared-catalogue id, so a repaired routine can be validated the way the app does. */
const CATALOGUE = EXERCISE_CATALOG[0].id;

test('the id the old generator produced is 36 characters and still not a UUID', () => {
  const id = legacyId(0);
  assert.equal(id.length, 36);
  assert.ok(/^[0-9a-f-]{36}$/i.test(id), 'which is why the old check let it through');
  assert.equal(isUuid(id), false, 'but a uuid column rejects it, permanently');
  assert.ok(isUuid('9b2f1c44-5d6e-4a7b-8c9d-0e1f2a3b4c5d'));
  // And the routine validator now refuses to mint another one.
  assert.throws(() => validateRoutine({ id: legacyId(1), name: 'Push A', exerciseIds: [], exercises: [], timesPerWeek: 2 }),
    /invalid identifier/);
});

test('an edit still persists locally while its upload is stuck in the queue', () => {
  const storage = memoryStorage();
  // A send that always fails the way a bad UUID does: 22P02, which the queue calls permanent.
  const engine = new SyncEngine(storage, async () => { throw Object.assign(new Error('bad uuid'), { code: '22P02' }); });
  engine.activate('alice');
  const routine = (name: string) => ({ id: '9b2f1c44-5d6e-4a7b-8c9d-0e1f2a3b4c5d', name, exerciseIds: ['e1'], timesPerWeek: 2 });

  engine.queue({ kind: 'routine', data: routine('Push A') } as never, 'routine:r1', { routines: [routine('Push A')] });
  engine.queue({ kind: 'routine', data: routine('Push A v2') } as never, 'routine:r1', { routines: [routine('Push A v2')] });

  const onDisk = JSON.parse(storage.get('account:alice')!) as AccountData;
  assert.deepEqual(onDisk.routines?.map(entry => entry.name), ['Push A v2'],
    'the second save reached storage; dropping it is what made an edit vanish on the next launch');
  assert.equal(engine.data.queue.length, 1, 'and it is still only queued once');
});

test('records stranded by an invalid id are given real ones and sent again', () => {
  counter = 0;
  const badExercise = legacyId(1);
  const badRoutine = legacyId(2);
  const data: AccountData = {
    version: 2, days: {}, entries: {}, lifts: {}, volumeLog: [], liftSessions: [], lastRecords: [],
    customExercises: [{ id: badExercise, name: 'Iso Row', primaryMuscle: 'upper_back', movementPattern: 'horizontal_pull',
      equipment: 'machine', trackingType: 'weight_reps', defaultRestSeconds: 120 }],
    routines: [{ id: badRoutine, name: 'Push A', exerciseIds: [badExercise, CATALOGUE],
      exercises: [{ exerciseId: badExercise, sets: 3, restSeconds: 120, repLow: 6, repHigh: 12 },
        { exerciseId: CATALOGUE, sets: 3, restSeconds: 120, repLow: 6, repHigh: 12 }],
      timesPerWeek: 2 }],
    workout: null, workoutReceipts: [],
    queue: [{ kind: 'routine', data: { id: badRoutine, name: 'Push A', exerciseIds: [badExercise] },
      id: `routine:${badRoutine}`, attempts: 4, nextAttemptAt: 0, blocked: true, error: 'invalid input syntax for type uuid' } as never],
    health: { enabled: false, summary: null, workouts: [], lastBatchAt: null, error: null, exported: [] },
  };

  const repaired = repairIdentifiers(data, uuid);
  const routine = repaired.data.routines![0];
  assert.ok(isUuid(routine.id), 'the routine can finally be written to a uuid column');
  assert.ok(isUuid(repaired.data.customExercises![0].id));

  // An exercise_ids array carrying one bad UUID fails the whole row, so references move too.
  assert.deepEqual(routine.exerciseIds, [repaired.data.customExercises![0].id, CATALOGUE]);
  assert.equal(routine.exercises![0].exerciseId, repaired.data.customExercises![0].id);
  assert.equal(routine.exercises![1].exerciseId, CATALOGUE, 'a valid id is left alone');
  assert.equal(routine.name, 'Push A', 'and nothing else about it changes');
  assert.equal(routine.timesPerWeek, 2);
  // The identifier check is what used to let these through; it passes now that the id is real.
  // (Full validation also resolves every exercise against the catalogue, which runtime does by
  // re-registering the repaired custom exercises before it queues them.)
  // Full validation also resolves every exercise against the catalogue, which runtime satisfies
  // by re-registering the repaired custom exercises before it queues them.
  assert.doesNotThrow(() => validateRoutine({ ...routine, exerciseIds: [CATALOGUE], exercises: undefined }));

  // The job that was stuck against the dead id is gone; the caller queues these again.
  assert.deepEqual(repaired.data.queue, []);
  assert.deepEqual(repaired.routines.map(entry => entry.id), [routine.id]);
  assert.deepEqual(repaired.exercises.map(entry => entry.id), [repaired.data.customExercises![0].id]);
});

test('an account whose records are already valid is left exactly as it was', () => {
  const data: AccountData = {
    version: 2, days: {}, entries: {}, lifts: {}, volumeLog: [], liftSessions: [], lastRecords: [],
    customExercises: [], workout: null, workoutReceipts: [], queue: [],
    routines: [{ id: '9b2f1c44-5d6e-4a7b-8c9d-0e1f2a3b4c5d', name: 'Push A', exerciseIds: [CATALOGUE], timesPerWeek: 2 }],
    health: { enabled: false, summary: null, workouts: [], lastBatchAt: null, error: null, exported: [] },
  };
  const repaired = repairIdentifiers(data, () => { throw new Error('must not mint an id for healthy data'); });
  assert.equal(repaired.data, data, 'the same object, so activation does no needless write');
  assert.deepEqual([repaired.routines, repaired.exercises], [[], []]);
});
