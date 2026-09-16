import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
let iosWriteGranted = true; let iosAvailable = true;
const calls: { kind: string; value: unknown }[] = [];
const done = (callback: (error: string, value: unknown) => void, value: unknown) => callback('', value);
mock.module('react-native', { namedExports: { NativeModules: { AppleHealthKit: {} } } });
mock.module('react-native-health', { defaultExport: {
  Constants: { Permissions: { Steps: 'Steps', ActiveEnergyBurned: 'ActiveEnergyBurned', Workout: 'Workout', EnergyConsumed: 'EnergyConsumed', Protein: 'Protein', Carbohydrates: 'Carbohydrates', FatTotal: 'FatTotal' }, Activities: { TraditionalStrengthTraining: 'TraditionalStrengthTraining' } },
  getAuthStatus: (_value: unknown, callback: Parameters<typeof done>[0]) => done(callback, { permissions: { read: [], write: [iosWriteGranted ? 2 : 1] } }),
  isAvailable: (callback: (error: unknown, value: unknown) => void) => iosAvailable ? callback(null, true) : callback('Health data is not available on this device', false),
  initHealthKit: (value: unknown, callback: (error: string) => void) => { calls.push({ kind: 'permissions', value }); callback(''); },
  getStepCount: (value: unknown, callback: Parameters<typeof done>[0]) => { calls.push({ kind: 'steps', value }); done(callback, { value: 8000 }); },
  getActiveEnergyBurned: (_value: unknown, callback: Parameters<typeof done>[0]) => done(callback, [{ value: 100 }, { value: 50 }]),
  getAnchoredWorkouts: (_value: unknown, callback: Parameters<typeof done>[0]) => done(callback, { data: [
    { id: 'watch', activityName: 'Walking', start: '2026-09-07T10:00:00Z', end: '2026-09-07T11:00:00Z', sourceId: 'com.apple.health' },
    { id: 'watch', activityName: 'Walking', start: '2026-09-07T10:00:00Z', end: '2026-09-07T11:00:00Z', sourceId: 'com.apple.health' },
    { id: 'export', sourceId: 'custom.bundle', metadata: { HKSyncIdentifier: 'rulocked:workout:w' } },
    { id: 'bad', activityName: 'Walk', start: '2026-09-07T10:00:00Z', end: 'invalid', sourceId: 'watch' },
  ] }),
  saveWorkout: (value: unknown, callback: Parameters<typeof done>[0]) => { calls.push({ kind: 'workout', value }); done(callback, {}); },
  saveFood: (value: unknown, callback: Parameters<typeof done>[0]) => { calls.push({ kind: 'food', value }); done(callback, {}); },
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
test('iOS adapter requests only specified health permissions and uses kcal-native writes', async () => {
  const { getHealthAdapter } = await import('../health/healthAdapter.ios');
  const adapter = await getHealthAdapter(); await adapter.initialize();
  // Each macro is its own authorisation on iOS. Asking for energy alone is why an exported
  // meal showed up in Apple Health with nothing but a calorie figure against it.
  assert.deepEqual(calls.find(c => c.kind === 'permissions')!.value, { permissions: {
    read: ['Steps', 'ActiveEnergyBurned', 'Workout'],
    write: ['Workout', 'EnergyConsumed', 'Protein', 'Carbohydrates', 'FatTotal'] } });
  const totals = await adapter.readToday(new Date(2026, 8, 7, 12)); assert.equal(totals.steps, 8000); assert.equal(totals.activeEnergyKcal, 150);
  await adapter.writeWorkout(workout); await adapter.writeDietaryEnergy(meal);
  assert.equal((await adapter.readWorkouts!(new Date())).length, 1);
  assert.ok(JSON.stringify(calls.find(c => c.kind === 'workout')!.value).includes('rulocked:workout:w'));
  // The macros ride on the same record as the energy, in grams.
  assert.deepEqual(calls.find(c => c.kind === 'food')!.value, { date: meal.date, foodName: 'Lunch', energy: 400,
    protein: 30, carbohydrates: 45, fatTotal: 12, metadata: { HKSyncIdentifier: 'rulocked:meal:m', HKSyncVersion: 1 } });
  // A meal with no macros writes none of them, rather than writing zeros that claim it had none.
  calls.length = 0;
  await adapter.writeDietaryEnergy({ id: 'm2', name: 'Snack', date: meal.date, caloriesKcal: 90 });
  const bare = calls.find(c => c.kind === 'food')!.value as Record<string, unknown>;
  for (const key of ['protein', 'carbohydrates', 'fatTotal']) assert.ok(!(key in bare), `${key} was written anyway`);
});
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

test('iOS write denial is explicit and does not create a native sample', async () => {
  const { getHealthAdapter } = await import('../health/healthAdapter.ios');
  const adapter = await getHealthAdapter(); iosWriteGranted = false;
  const before = calls.filter(c => c.kind === 'workout').length;
  await assert.rejects(adapter.writeWorkout(workout), (error: unknown) => { assert.equal((error as { code: string }).code, 'HEALTH_PERMISSION'); return true; });
  assert.equal(calls.filter(c => c.kind === 'workout').length, before); iosWriteGranted = true;
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

test('the two failure shapes are told apart, because they mean different things', async () => {
  const { getHealthAdapter } = await import('../health/healthAdapter.ios');
  const adapter = await getHealthAdapter();
  // iOS refusing through the callback names the call and quotes the refusal.
  iosAvailable = false;
  await assert.rejects(adapter.initialize(), /HealthKit isAvailable failed: Health data is not available/);
  iosAvailable = true;
});
