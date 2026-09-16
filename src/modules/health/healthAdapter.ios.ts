import { NativeModules } from 'react-native';
import type { AnchoredQueryResults, HealthValue, HealthStatusResult } from 'react-native-health';
import { localDay, type HealthAdapter } from './types';
function callback<T>(run: (done: (error: string, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('HealthKit request timed out.')), 30_000);
    try { run((error, result) => { clearTimeout(timer); error ? reject(new Error('Health access is unavailable. Review permissions in Apple Health and try again.')) : resolve(result); }); } catch { clearTimeout(timer); reject(new Error('HealthKit is unavailable. Reopen the app and try again.')); }
  });
}
export async function getHealthAdapter(): Promise<HealthAdapter> {
  if (!NativeModules.AppleHealthKit) throw new Error('HealthKit is not linked. Install an iOS development build.');
  type HealthKit = typeof import('react-native-health').default;
  const imported = require('react-native-health') as HealthKit & { default?: HealthKit };
  const kit = imported.default ?? imported;
  async function requireWrite(permission: typeof kit.Constants.Permissions.Workout | typeof kit.Constants.Permissions.EnergyConsumed) {
    const status = await callback<HealthStatusResult>(done => kit.getAuthStatus({ permissions: { read: [], write: [permission] } }, done));
    if (status.permissions.write[0] !== 2) throw Object.assign(new Error('Health write permission is unavailable. Review access in Apple Health, then retry the queued export.'), { code: 'HEALTH_PERMISSION' });
  }
  return {
    async initialize() {
      const available = await callback<boolean>(done => kit.isAvailable((error, result) => done(error ? String(error) : '', result)));
      if (!available) throw new Error('HealthKit is unavailable on this device.');
      const p = kit.Constants.Permissions;
      await callback<void>(done => kit.initHealthKit({ permissions: {
        read: [p.Steps, p.ActiveEnergyBurned, p.Workout],
        // A meal exported as energy alone shows up in Apple Health with no macros against it,
        // which is most of what was logged. Each is a separate authorisation on iOS.
        write: [p.Workout, p.EnergyConsumed, p.Protein, p.Carbohydrates, p.FatTotal],
      } }, error => done(error, undefined)));
      // iOS intentionally does not disclose whether read permission was denied.
    },
    async readToday(now) {
      const day = localDay(now);
      const [steps, energy] = await Promise.all([
        callback<HealthValue>(done => kit.getStepCount({ date: now.toISOString(), includeManuallyAdded: false }, done)),
        callback<HealthValue[]>(done => kit.getActiveEnergyBurned({ startDate: day.start, endDate: day.end, includeManuallyAdded: false }, done)),
      ]);
      return { date: day.date, steps: Number.isFinite(steps.value) ? Math.max(0, Math.floor(steps.value)) : null,
        activeEnergyKcal: energy.every(sample => Number.isFinite(sample.value)) ? energy.reduce((sum, sample) => sum + sample.value, 0) : null };
    },
    async readWorkouts(now) {
      const result = await callback<AnchoredQueryResults>(done => kit.getAnchoredWorkouts({
        startDate: new Date(now.getTime() - 7 * 86400_000).toISOString(), endDate: now.toISOString(), limit: 0,
      }, (error, result) => done(error ? 'Health access unavailable' : '', result)));
      const unique = new Map<string, import('./types').HealthWorkout>();
      for (const sample of result.data) {
        // Exclude this app's exports (including older builds with the default bundle ID).
        if (String(sample.metadata?.HKSyncIdentifier ?? '').startsWith('rulocked:') || /^com\.rulocked\.app(?:\.|$)/.test(sample.sourceId)) continue;
        if (!sample.id || !Number.isFinite(Date.parse(sample.start)) || !Number.isFinite(Date.parse(sample.end)) || !sample.activityName || Date.parse(sample.end) <= Date.parse(sample.start)) continue;
        unique.set(sample.id, { id: sample.id, name: sample.activityName, start: sample.start, end: sample.end });
      }
      return [...unique.values()];
    },
    async writeWorkout(workout) {
      await requireWrite(kit.Constants.Permissions.Workout);
      await callback(done => kit.saveWorkout({ type: kit.Constants.Activities.TraditionalStrengthTraining,
        startDate: workout.start, endDate: workout.end, metadata: { HKSyncIdentifier: `rulocked:workout:${workout.id}`, HKSyncVersion: 1 } } as Parameters<typeof kit.saveWorkout>[0], done));
    },
    async writeDietaryEnergy(meal) {
      await requireWrite(kit.Constants.Permissions.EnergyConsumed);
      // The native saveFood implementation uses kilocalories for the energy field, and grams
      // for each macro. A macro the meal does not carry is left out of the payload entirely:
      // sending 0 would claim the food contains none of it.
      const macros = Object.fromEntries(([['protein', meal.proteinG], ['carbohydrates', meal.carbsG], ['fatTotal', meal.fatG]] as const)
        .filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0));
      const food = { date: meal.date, foodName: meal.name, energy: meal.caloriesKcal, ...macros,
        metadata: { HKSyncIdentifier: `rulocked:meal:${meal.id}`, HKSyncVersion: meal.version ?? 1 } };
      await callback(done => kit.saveFood(food, done));
    },
  };
}
