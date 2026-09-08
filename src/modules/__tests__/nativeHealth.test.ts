import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
const calls: { kind: string; value: unknown }[] = [];
const done = (callback: (error: string, value: unknown) => void, value: unknown) => callback('', value);
mock.module('react-native', { namedExports: { NativeModules: { AppleHealthKit: {} } } });
mock.module('react-native-health', { defaultExport: {
  Constants: { Permissions: { Steps: 'Steps', ActiveEnergyBurned: 'ActiveEnergyBurned', Workout: 'Workout', EnergyConsumed: 'EnergyConsumed' }, Activities: { TraditionalStrengthTraining: 'TraditionalStrengthTraining' } },
  isAvailable: (callback: Parameters<typeof done>[0]) => done(callback, true),
  initHealthKit: (value: unknown, callback: (error: string) => void) => { calls.push({ kind: 'permissions', value }); callback(''); },
  getStepCount: (value: unknown, callback: Parameters<typeof done>[0]) => { calls.push({ kind: 'steps', value }); done(callback, { value: 8000 }); },
  getActiveEnergyBurned: (_value: unknown, callback: Parameters<typeof done>[0]) => done(callback, [{ value: 100 }, { value: 50 }]),
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
const meal = { id: 'm', name: 'Lunch', date: workout.end, caloriesKcal: 400 };
test('iOS adapter requests only specified health permissions and uses kcal-native writes', async () => {
  const { getHealthAdapter } = await import('../health/healthAdapter.ios');
  const adapter = await getHealthAdapter(); await adapter.initialize();
  assert.deepEqual(calls.find(c => c.kind === 'permissions')!.value, { permissions: { read: ['Steps', 'ActiveEnergyBurned'], write: ['Workout', 'EnergyConsumed'] } });
  const totals = await adapter.readToday(new Date(2026, 8, 7, 12)); assert.equal(totals.steps, 8000); assert.equal(totals.activeEnergyKcal, 150);
  await adapter.writeWorkout(workout); await adapter.writeDietaryEnergy(meal);
  assert.deepEqual(calls.find(c => c.kind === 'food')!.value, { date: meal.date, foodName: 'Lunch', energy: 400 });
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
