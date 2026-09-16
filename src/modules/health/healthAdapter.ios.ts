import { localDay, type HealthAdapter, type HealthWorkout } from './types';

/**
 * Apple Health through @kingstinct/react-native-healthkit, which is a Nitro module and so is
 * built for the New Architecture. The library this replaced was a legacy bridge module — no
 * codegen spec, `RCT_EXPORT_MODULE` only — and on React Native 0.86 the old bridge is gone, so
 * every one of its methods resolved to undefined at runtime.
 *
 * The HealthAdapter interface is unchanged, so the sync queue, the export path and their tests
 * never learn that any of this moved.
 */
type Kit = typeof import('@kingstinct/react-native-healthkit');

/** Everything written, so a single list drives the permission request and the write checks. */
const SHARE = ['HKQuantityTypeIdentifierDietaryEnergyConsumed', 'HKQuantityTypeIdentifierDietaryProtein',
  'HKQuantityTypeIdentifierDietaryCarbohydrates', 'HKQuantityTypeIdentifierDietaryFatTotal', 'HKWorkoutTypeIdentifier'] as const;
const READ = ['HKQuantityTypeIdentifierStepCount', 'HKQuantityTypeIdentifierActiveEnergyBurned', 'HKWorkoutTypeIdentifier'] as const;
/** The macro each identifier carries, and the unit HealthKit stores it in. */
const MACROS = [
  ['HKQuantityTypeIdentifierDietaryProtein', 'proteinG'],
  ['HKQuantityTypeIdentifierDietaryCarbohydrates', 'carbsG'],
  ['HKQuantityTypeIdentifierDietaryFatTotal', 'fatG'],
] as const;

/** Whatever HealthKit actually said, as text: a generic message cannot be read off a TestFlight
 *  build, where there is no debugger to attach. */
export function describeHealthError(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'no detail given';
  if (typeof value === 'string') return value;
  const error = value as { message?: unknown; code?: unknown; domain?: unknown };
  const parts = [
    typeof error.message === 'string' && error.message ? error.message : null,
    error.code !== undefined && error.code !== null ? `code ${String(error.code)}` : null,
    typeof error.domain === 'string' && error.domain ? `domain ${error.domain}` : null,
  ].filter(Boolean) as string[];
  if (parts.length) return parts.join(' · ');
  try { const json = JSON.stringify(value); if (json && json !== '{}') return json; } catch { /* fall through */ }
  return String(value);
}
async function named<T>(label: string, run: () => Promise<T> | T): Promise<T> {
  try { return await run(); }
  catch (cause) { throw new Error(`HealthKit ${label} failed: ${describeHealthError(cause)}`); }
}

export async function getHealthAdapter(): Promise<HealthAdapter> {
  let kit: Kit;
  try { kit = await import('@kingstinct/react-native-healthkit'); }
  catch (cause) { throw new Error(`HealthKit is not linked into this build: ${describeHealthError(cause)}`); }
  // A module that loaded but has no methods is the shape the old bridge library failed in.
  const missing = (['isHealthDataAvailableAsync', 'requestAuthorization', 'saveQuantitySample'] as const)
    .filter(name => typeof (kit as unknown as Record<string, unknown>)[name] !== 'function');
  if (missing.length) throw new Error(`HealthKit linked, but these methods are missing: ${missing.join(', ')}. The build and the JS bundle are out of step.`);

  /** iOS never discloses read permission, but it does disclose write, and writing without it
   *  fails silently — so the export says so rather than reporting a success it did not have. */
  function requireWrite(identifier: (typeof SHARE)[number]) {
    if (kit.authorizationStatusFor(identifier) !== 2) {
      throw Object.assign(new Error('Health write permission is unavailable. Review access in Apple Health, then retry the queued export.'), { code: 'HEALTH_PERMISSION' });
    }
  }
  const total = async (identifier: 'HKQuantityTypeIdentifierStepCount' | 'HKQuantityTypeIdentifierActiveEnergyBurned', unit: string, day: { start: string; end: string }) => {
    const result = await kit.queryStatisticsForQuantity(identifier, ['cumulativeSum'],
      { filter: { startDate: new Date(day.start), endDate: new Date(day.end) }, unit } as never);
    const sum = (result as { sumQuantity?: { quantity?: number } })?.sumQuantity?.quantity;
    return typeof sum === 'number' && Number.isFinite(sum) ? sum : null;
  };

  return {
    async initialize() {
      const available = await named('isHealthDataAvailable', () => kit.isHealthDataAvailableAsync());
      if (!available) throw new Error('HealthKit is unavailable on this device.');
      await named('requestAuthorization', () => kit.requestAuthorization({ toShare: SHARE, toRead: READ }));
      // iOS intentionally does not disclose whether read permission was denied.
    },
    async readToday(now) {
      const day = localDay(now);
      const [steps, energy] = await named('queryStatistics', () => Promise.all([
        total('HKQuantityTypeIdentifierStepCount', 'count', day),
        total('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', day),
      ]));
      return { date: day.date, steps: steps === null ? null : Math.max(0, Math.floor(steps)), activeEnergyKcal: energy };
    },
    async readWorkouts(now) {
      const samples = await named('queryWorkoutSamples', () => kit.queryWorkoutSamples({
        filter: { startDate: new Date(now.getTime() - 7 * 86400_000), endDate: now },
      } as never));
      const unique = new Map<string, HealthWorkout>();
      for (const sample of samples as unknown as readonly Record<string, unknown>[]) {
        const metadata = (sample.metadata ?? {}) as Record<string, unknown>;
        const source = String((sample.sourceRevision as { source?: { bundleIdentifier?: string } })?.source?.bundleIdentifier ?? '');
        // Exclude this app's own exports, including older builds under the previous bundle ID.
        if (String(metadata.HKSyncIdentifier ?? '').startsWith('rulocked:') || /^com\.rulocked\.app(?:\.|$)/.test(source)) continue;
        const id = String(sample.uuid ?? '');
        const start = sample.startDate as unknown as Date; const end = sample.endDate as unknown as Date;
        if (!id || !(start instanceof Date) || !(end instanceof Date)) continue;
        unique.set(id, { id, name: String(sample.workoutActivityType ?? 'Workout'), start: start.toISOString(), end: end.toISOString() });
      }
      return [...unique.values()];
    },
    async writeWorkout(workout) {
      requireWrite('HKWorkoutTypeIdentifier');
      await named('saveWorkoutSample', () => kit.saveWorkoutSample('traditionalStrengthTraining' as never, [],
        new Date(workout.start), new Date(workout.end), undefined,
        { HKSyncIdentifier: `rulocked:workout:${workout.id}`, HKSyncVersion: 1 } as never));
    },
    async writeDietaryEnergy(meal) {
      requireWrite('HKQuantityTypeIdentifierDietaryEnergyConsumed');
      const at = new Date(meal.date);
      // One sync identifier for the meal, one version for this export. HealthKit replaces a
      // known identifier only when the version is higher, which is what makes an edit a
      // replacement rather than a duplicate it ignores.
      const metadata = { HKSyncIdentifier: `rulocked:meal:${meal.id}`, HKSyncVersion: meal.version ?? 1 } as never;
      await named('saveQuantitySample', () => kit.saveQuantitySample(
        'HKQuantityTypeIdentifierDietaryEnergyConsumed', 'kcal' as never, meal.caloriesKcal, at, at, metadata));
      // A macro the meal does not carry is not written at all; a zero would claim it had none.
      for (const [identifier, key] of MACROS) {
        const grams = meal[key];
        if (typeof grams !== 'number' || !Number.isFinite(grams) || grams < 0) continue;
        requireWrite(identifier);
        await named(`saveQuantitySample(${key})`, () => kit.saveQuantitySample(identifier, 'g' as never, grams, at, at, metadata));
      }
    },
    /** Now possible, where the old library had no delete at all: a meal removed from the diary
     *  can be removed from Health instead of being left behind or overwritten with a zero. */
    async deleteMeal(id: string) {
      const filter = { metadata: { HKSyncIdentifier: `rulocked:meal:${id}` } } as never;
      for (const identifier of ['HKQuantityTypeIdentifierDietaryEnergyConsumed', ...MACROS.map(([type]) => type)] as const) {
        try { await kit.deleteObjects(identifier, filter); } catch { /* Already gone, or never written. */ }
      }
    },
  };
}
