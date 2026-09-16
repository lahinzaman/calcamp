import { NativeModules } from 'react-native';
import type { AnchoredQueryResults, HealthValue, HealthStatusResult } from 'react-native-health';
import { localDay, type HealthAdapter } from './types';
/**
 * Whatever iOS actually said, as text. A generic message here is the difference between a bug
 * that can be read off the screen and one that needs a debugger attached to a TestFlight build.
 */
export function describeHealthError(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'no detail given';
  if (typeof value === 'string') return value;
  const error = value as { message?: unknown; code?: unknown; domain?: unknown; nativeStackIOS?: unknown };
  const parts = [
    typeof error.message === 'string' && error.message ? error.message : null,
    error.code !== undefined && error.code !== null ? `code ${String(error.code)}` : null,
    typeof error.domain === 'string' && error.domain ? `domain ${error.domain}` : null,
  ].filter(Boolean) as string[];
  if (parts.length) return parts.join(' · ');
  try { const json = JSON.stringify(value); if (json && json !== '{}') return json; } catch { /* fall through */ }
  return String(value);
}

/**
 * `label` names the native call, because the two failure shapes mean different things: an error
 * handed back through the callback is iOS refusing, while a synchronous throw means the method
 * was never really there — a module that did not link, or one whose surface has moved.
 */
function callback<T>(label: string, run: (done: (error: string, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`HealthKit ${label} did not answer within 30 seconds.`)), 30_000);
    try {
      run((error, result) => {
        clearTimeout(timer);
        if (error) reject(new Error(`HealthKit ${label} failed: ${describeHealthError(error)}`));
        else resolve(result);
      });
    } catch (cause) {
      clearTimeout(timer);
      reject(new Error(`HealthKit ${label} threw before iOS answered: ${describeHealthError(cause)}`));
    }
  });
}
export async function getHealthAdapter(): Promise<HealthAdapter> {
  if (!NativeModules.AppleHealthKit) throw new Error('HealthKit is not linked into this build. Install a development or TestFlight build that includes react-native-health.');
  type HealthKit = typeof import('react-native-health').default;
  const imported = require('react-native-health') as HealthKit & { default?: HealthKit };
  const kit = imported.default ?? imported;
  // A JS module that loaded but whose methods are absent is the shape that produced a bare
  // "HealthKit is unavailable": the call threw synchronously because there was nothing to call.
  const missing = (['isAvailable', 'initHealthKit', 'getAuthStatus', 'getStepCount', 'saveFood'] as const)
    .filter(name => typeof (kit as unknown as Record<string, unknown>)[name] !== 'function');
  if (missing.length) throw new Error(`HealthKit linked, but these native methods are missing: ${missing.join(', ')}. The build and the JS bundle are out of step — install a build made from this commit.`);
  async function requireWrite(permission: typeof kit.Constants.Permissions.Workout | typeof kit.Constants.Permissions.EnergyConsumed) {
    const status = await callback<HealthStatusResult>('getAuthStatus', done => kit.getAuthStatus({ permissions: { read: [], write: [permission] } }, done));
    if (status.permissions.write[0] !== 2) throw Object.assign(new Error('Health write permission is unavailable. Review access in Apple Health, then retry the queued export.'), { code: 'HEALTH_PERMISSION' });
  }
  return {
    async initialize() {
      const available = await callback<boolean>('isAvailable', done => kit.isAvailable((error, result) => done(error ? String(error) : '', result)));
      if (!available) throw new Error('HealthKit is unavailable on this device.');
      const p = kit.Constants.Permissions;
      await callback<void>('initHealthKit', done => kit.initHealthKit({ permissions: {
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
        callback<HealthValue>('getStepCount', done => kit.getStepCount({ date: now.toISOString(), includeManuallyAdded: false }, done)),
        callback<HealthValue[]>('getActiveEnergyBurned', done => kit.getActiveEnergyBurned({ startDate: day.start, endDate: day.end, includeManuallyAdded: false }, done)),
      ]);
      return { date: day.date, steps: Number.isFinite(steps.value) ? Math.max(0, Math.floor(steps.value)) : null,
        activeEnergyKcal: energy.every(sample => Number.isFinite(sample.value)) ? energy.reduce((sum, sample) => sum + sample.value, 0) : null };
    },
    async readWorkouts(now) {
      const result = await callback<AnchoredQueryResults>('getAnchoredWorkouts', done => kit.getAnchoredWorkouts({
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
      await callback('saveWorkout', done => kit.saveWorkout({ type: kit.Constants.Activities.TraditionalStrengthTraining,
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
      await callback('saveFood', done => kit.saveFood(food, done));
    },
  };
}
