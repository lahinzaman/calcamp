import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
let iosAvailable = true; let iosWriteStatus = 2;
const calls: { kind: string; value: unknown }[] = [];
const kitCalls: { kind: string; value: unknown }[] = [];
mock.module('@kingstinct/react-native-healthkit', { namedExports: {
  isHealthDataAvailableAsync: async () => { if (!iosAvailable) throw new Error('Health data is not available on this device'); return true; },
  requestAuthorization: async (toRequest: unknown) => { kitCalls.push({ kind: 'permissions', value: toRequest }); return true; },
  authorizationStatusFor: () => iosWriteStatus,
  queryStatisticsForQuantity: async (identifier: string) => ({ sumQuantity: { quantity: identifier.includes('StepCount') ? 8000 : 150 } }),
  queryWorkoutSamples: async () => [],
  saveWorkoutSample: async (...value: unknown[]) => { kitCalls.push({ kind: 'workout', value }); },
  saveQuantitySample: async (identifier: string, unit: string, amount: number, start: Date, end: Date, metadata: unknown) => {
    kitCalls.push({ kind: 'quantity', value: { identifier, unit, amount, metadata } }); },
  deleteObjects: async (identifier: string, filter: unknown) => { kitCalls.push({ kind: 'delete', value: { identifier, filter } }); return 1; },
} });
const permissions = [
  { accessType: 'read', recordType: 'Steps' }, { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'write', recordType: 'ExerciseSession' }, { accessType: 'write', recordType: 'Nutrition' },
];
let granted = permissions;
mock.module('react-native-health-connect', { namedExports: {
  SdkAvailabilityStatus: { SDK_AVAILABLE: 3 }, getSdkStatus: async () => 3, initialize: async () => true,
  requestPermission: async (value: unknown) => { calls.push({ kind: 'android-permissions', value }); return permissions; },
  getGrantedPermissions: async () => granted,
  aggregateRecord: async ({ recordType }: { recordType: string }) => recordType === 'Steps' ? { COUNT_TOTAL: 7000 } : { ACTIVE_CALORIES_TOTAL: { inKilocalories: 200 } },
  ExerciseType: { STRENGTH_TRAINING: 70 }, MealType: { UNKNOWN: 0 },
  insertRecords: async (value: unknown) => { calls.push({ kind: 'records', value }); return ['record']; },
} });
const workout = { id: 'w', name: 'Upper', start: '2026-09-07T10:00:00Z', end: '2026-09-07T11:00:00Z' };
const meal = { id: 'm', name: 'Lunch', date: workout.end, caloriesKcal: 400, proteinG: 30, carbsG: 45, fatG: 12 };
test('Android adapter aggregates records and verifies current write permissions', async () => {
  const { getHealthAdapter } = await import('../health/healthAdapter.android');
  const adapter = await getHealthAdapter(); await adapter.initialize();
  assert.deepEqual(calls.find(c => c.kind === 'android-permissions')!.value, permissions);
  assert.equal((await adapter.readToday(new Date(2026, 8, 7, 12))).steps, 7000);
  await adapter.writeWorkout(workout); await adapter.writeDietaryEnergy(meal);
  const records = calls.filter(c => c.kind === 'records').map(c => c.value);
  assert.equal(records.length, 2);
  assert.ok(JSON.stringify(records).includes('kilocalories'));
  assert.ok(JSON.stringify(records).includes('clientRecordId'));
  granted = []; const unavailable = await adapter.readToday(new Date()); assert.equal(unavailable.steps, null);
  await assert.rejects(adapter.writeWorkout(workout), /permission/);
});

test('a meal exports its macros, and a macro it does not have is left out rather than zeroed', () => {
  const { validateHealthMeal } = require('../health/types') as typeof import('../health/types');
  const base = { id: 'm1', name: 'Lunch', date: new Date().toISOString(), caloriesKcal: 620 };
  validateHealthMeal({ ...base, proteinG: 45, carbsG: 63, fatG: 21.5 });
  // Absent is allowed: a meal queued before macros were exported still replays.
  validateHealthMeal(base);
  // Present and nonsense is not, because it would land in Apple Health as a real figure.
  for (const bad of [{ proteinG: -1 }, { carbsG: Number.NaN }, { fatG: 20_000 }]) {
    assert.throws(() => validateHealthMeal({ ...base, ...bad }), /macros in grams/);
  }
});

test('a HealthKit failure reaches the screen as what iOS actually said', async () => {
  const { describeHealthError } = await import('../health/healthAdapter.ios');
  // The generic fallback was unreadable on a TestFlight build, where there is no debugger to
  // attach. Each shape iOS can hand back has to survive to the UI.
  assert.equal(describeHealthError('Authorization not determined'), 'Authorization not determined');
  assert.equal(describeHealthError({ message: 'Missing entitlement', code: 5, domain: 'com.apple.healthkit' }),
    'Missing entitlement · code 5 · domain com.apple.healthkit');
  assert.equal(describeHealthError(new TypeError('kit.isAvailable is not a function')), 'kit.isAvailable is not a function');
  assert.equal(describeHealthError({ unexpected: true }), '{"unexpected":true}');
  assert.equal(describeHealthError(null), 'no detail given');
  assert.equal(describeHealthError(''), 'no detail given');
});

test('iOS asks for exactly the types it reads and writes, through the Nitro module', async () => {
  const { getHealthAdapter } = await import('../health/healthAdapter.ios');
  const adapter = await getHealthAdapter();
  kitCalls.length = 0;
  await adapter.initialize();
  const asked = kitCalls.find(call => call.kind === 'permissions')!.value as { toShare: string[]; toRead: string[] };
  // Each macro is its own HealthKit type; asking for energy alone is why an exported meal
  // arrived with nothing but a calorie figure against it.
  assert.deepEqual([...asked.toShare], ['HKQuantityTypeIdentifierDietaryEnergyConsumed', 'HKQuantityTypeIdentifierDietaryProtein',
    'HKQuantityTypeIdentifierDietaryCarbohydrates', 'HKQuantityTypeIdentifierDietaryFatTotal', 'HKWorkoutTypeIdentifier']);
  assert.deepEqual([...asked.toRead], ['HKQuantityTypeIdentifierStepCount', 'HKQuantityTypeIdentifierActiveEnergyBurned', 'HKWorkoutTypeIdentifier']);

  const totals = await adapter.readToday(new Date(2026, 8, 7, 12));
  assert.equal(totals.steps, 8000); assert.equal(totals.activeEnergyKcal, 150);
});

test('a meal writes energy and every macro it carries, under one sync identifier', async () => {
  const { getHealthAdapter } = await import('../health/healthAdapter.ios');
  const adapter = await getHealthAdapter();
  kitCalls.length = 0;
  await adapter.writeDietaryEnergy({ ...meal, version: 99 });
  const written = kitCalls.filter(call => call.kind === 'quantity').map(call => call.value as { identifier: string; unit: string; amount: number; metadata: Record<string, unknown> });
  assert.deepEqual(written.map(w => [w.identifier.replace('HKQuantityTypeIdentifierDietary', ''), w.unit, w.amount]),
    [['EnergyConsumed', 'kcal', 400], ['Protein', 'g', 30], ['Carbohydrates', 'g', 45], ['FatTotal', 'g', 12]]);
  // One identifier for the meal and one version for the export, so a later edit replaces it.
  for (const sample of written) {
    assert.equal(sample.metadata.HKSyncIdentifier, 'rulocked:meal:m');
    assert.equal(sample.metadata.HKSyncVersion, 99);
  }

  // A macro the meal does not carry is not written at all.
  kitCalls.length = 0;
  await adapter.writeDietaryEnergy({ id: 'm2', name: 'Snack', date: meal.date, caloriesKcal: 90 });
  assert.equal(kitCalls.filter(call => call.kind === 'quantity').length, 1);
});

test('a denied write is refused outright rather than reported as a success', async () => {
  const { getHealthAdapter } = await import('../health/healthAdapter.ios');
  const adapter = await getHealthAdapter();
  iosWriteStatus = 1;
  kitCalls.length = 0;
  await assert.rejects(adapter.writeDietaryEnergy(meal), /Health write permission is unavailable/);
  assert.equal(kitCalls.filter(call => call.kind === 'quantity').length, 0, 'and nothing was written');
  iosWriteStatus = 2;
});

test('a deleted meal can now be removed from Health, which the old library could not do', async () => {
  const { getHealthAdapter } = await import('../health/healthAdapter.ios');
  const adapter = await getHealthAdapter();
  kitCalls.length = 0;
  await adapter.deleteMeal!('m');
  const deleted = kitCalls.filter(call => call.kind === 'delete').map(call => (call.value as { identifier: string }).identifier);
  assert.equal(deleted.length, 4, 'energy and all three macros');
  assert.ok(deleted.every(id => id.startsWith('HKQuantityTypeIdentifierDietary')));
});


test('iOS refusing names the call it refused', async () => {
  const { getHealthAdapter } = await import('../health/healthAdapter.ios');
  const adapter = await getHealthAdapter();
  iosAvailable = false;
  await assert.rejects(adapter.initialize(), /HealthKit isHealthDataAvailable failed: Health data is not available/);
  iosAvailable = true;
});

test('a permission sheet that never presents fails instead of spinning forever', async () => {
  const { named } = await import('../health/healthAdapter.ios');
  // The request a dropped sheet leaves behind: a promise nothing will ever settle.
  const never = () => new Promise<never>(() => {});
  const started = Date.now();
  await assert.rejects(named('requestAuthorization', never, 40), /did not answer within 0 seconds/);
  assert.ok(Date.now() - started < 1000, 'it gave up at its bound, not after twenty minutes');

  // A call that does answer is untouched by the bound, and its own failure keeps its wording.
  assert.equal(await named('isHealthDataAvailable', async () => true, 40), true);
  await assert.rejects(named('saveQuantitySample', async () => { throw new Error('Not authorized'); }, 40),
    /HealthKit saveQuantitySample failed: Not authorized/);
});

test('a sheet that never appeared says so, rather than blaming permissions', async () => {
  const { explainAuthorizationFailure } = await import('../health/healthAdapter.ios');
  // A timed-out request is a sheet iOS dropped, not a person who said no.
  assert.match(explainAuthorizationFailure(new Error('HealthKit requestAuthorization did not answer within 180 seconds.')).message,
    /permission sheet never appeared/);
  // Anything else keeps what iOS said.
  assert.equal(explainAuthorizationFailure(new Error('HealthKit requestAuthorization failed: Not entitled')).message,
    'HealthKit requestAuthorization failed: Not entitled');
  assert.equal(explainAuthorizationFailure('raw string').message, 'raw string');
});
