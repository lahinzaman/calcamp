import { NativeModules } from 'react-native';
import type { HealthValue } from 'react-native-health';
import { localDay, type HealthAdapter } from './types';
function callback<T>(run: (done: (error: string, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('HealthKit request timed out.')), 30_000);
    run((error, result) => { clearTimeout(timer); error ? reject(new Error(String(error))) : resolve(result); });
  });
}
export async function getHealthAdapter(): Promise<HealthAdapter> {
  if (!NativeModules.AppleHealthKit) throw new Error('HealthKit is not linked. Install an iOS development build.');
  type HealthKit = typeof import('react-native-health').default;
  const imported = require('react-native-health') as HealthKit & { default?: HealthKit };
  const kit = imported.default ?? imported;
  return {
    async initialize() {
      const available = await callback<boolean>(done => kit.isAvailable((error, result) => done(error ? String(error) : '', result)));
      if (!available) throw new Error('HealthKit is unavailable on this device.');
      const p = kit.Constants.Permissions;
      await callback<void>(done => kit.initHealthKit({ permissions: {
        read: [p.Steps, p.ActiveEnergyBurned], write: [p.Workout, p.EnergyConsumed],
      } }, error => done(error, undefined)));
      // iOS intentionally does not disclose whether read permission was denied.
    },
    async readToday(now) {
      const day = localDay(now);
      const [steps, energy] = await Promise.all([
        callback<HealthValue>(done => kit.getStepCount({ date: now.toISOString(), includeManuallyAdded: false }, done)),
        callback<HealthValue[]>(done => kit.getActiveEnergyBurned({ startDate: day.start, endDate: day.end }, done)),
      ]);
      return { date: day.date, steps: Number.isFinite(steps.value) ? Math.max(0, Math.floor(steps.value)) : null,
        activeEnergyKcal: energy.every(sample => Number.isFinite(sample.value)) ? energy.reduce((sum, sample) => sum + sample.value, 0) : null };
    },
    async writeWorkout(workout) {
      await callback(done => kit.saveWorkout({ type: kit.Constants.Activities.TraditionalStrengthTraining,
        startDate: workout.start, endDate: workout.end }, done));
    },
    async writeDietaryEnergy(meal) {
      // The native saveFood implementation uses kilocalories for the energy field.
      const food = { date: meal.date, foodName: meal.name, energy: meal.caloriesKcal };
      await callback(done => kit.saveFood(food, done));
    },
  };
}
