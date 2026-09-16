import { localDay, type HealthAdapter } from './types';
export async function getHealthAdapter(): Promise<HealthAdapter> {
  // Import only when the user requests health access; unsupported runtimes surface an error.
  const hc = await import('react-native-health-connect');
  if (await hc.getSdkStatus() !== hc.SdkAvailabilityStatus.SDK_AVAILABLE || !await hc.initialize()) throw new Error('Health Connect is unavailable on this device.');
  const permissions: import('react-native-health-connect').Permission[] = [
    { accessType: 'read', recordType: 'Steps' }, { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    { accessType: 'write', recordType: 'ExerciseSession' }, { accessType: 'write', recordType: 'Nutrition' },
  ];
  async function requireWrite(recordType: 'ExerciseSession' | 'Nutrition') {
    const granted = await hc.getGrantedPermissions();
    if (!granted.some(p => 'recordType' in p && p.recordType === recordType && p.accessType === 'write')) throw Object.assign(new Error('Enable the requested write permission in Health Connect.'), { code: 'HEALTH_PERMISSION' });
  }
  return {
    async initialize() {
      if (await hc.getSdkStatus() !== hc.SdkAvailabilityStatus.SDK_AVAILABLE || !await hc.initialize()) {
        throw new Error('Install or update Health Connect on this device.');
      }
      await hc.requestPermission(permissions);
    },
    async readToday(now) {
      const day = localDay(now);
      const granted = await hc.getGrantedPermissions();
      const canRead = (type: string) => granted.some(p => 'recordType' in p && p.accessType === 'read' && p.recordType === type);
      const timeRangeFilter = { operator: 'between' as const, startTime: day.start, endTime: day.end };
      const [steps, energy] = await Promise.all([
        canRead('Steps') ? hc.aggregateRecord({ recordType: 'Steps', timeRangeFilter }) : null,
        canRead('ActiveCaloriesBurned') ? hc.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter }) : null,
      ]);
      return { date: day.date, steps: steps?.COUNT_TOTAL ?? null,
        activeEnergyKcal: energy?.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? null };
    },
    async writeWorkout(workout) {
      await requireWrite('ExerciseSession');
      await hc.insertRecords([{ recordType: 'ExerciseSession', startTime: workout.start, endTime: workout.end,
        exerciseType: hc.ExerciseType.STRENGTH_TRAINING, title: workout.name,
        metadata: { clientRecordId: `workout-${workout.id}`, clientRecordVersion: 1 } }]);
    },
    async writeDietaryEnergy(meal) {
      await requireWrite('Nutrition');
      await hc.insertRecords([{ recordType: 'Nutrition', startTime: meal.date,
        endTime: new Date(Date.parse(meal.date) + 1000).toISOString(), name: meal.name, mealType: hc.MealType.UNKNOWN,
        energy: { value: meal.caloriesKcal, unit: 'kilocalories' },
        // Health Connect takes macros in grams on the same record. Omitted, not zeroed.
        ...(typeof meal.proteinG === 'number' ? { protein: { value: meal.proteinG, unit: 'grams' } } : {}),
        ...(typeof meal.carbsG === 'number' ? { totalCarbohydrate: { value: meal.carbsG, unit: 'grams' } } : {}),
        ...(typeof meal.fatG === 'number' ? { totalFat: { value: meal.fatG, unit: 'grams' } } : {}),
        metadata: { clientRecordId: `meal-${meal.id}`, clientRecordVersion: 1 } }]);
    },
  };
}
