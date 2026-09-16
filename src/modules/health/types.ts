export interface HealthSummary { steps: number | null; activeEnergyKcal: number | null; date: string }
export interface HealthWorkout { id: string; name: string; start: string; end: string }
export interface HealthMeal {
  id: string; name: string; date: string; caloriesKcal: number;
  /** Absent on a meal queued before macros were exported; absent is not zero, so it is simply
   *  not written rather than written as none. */
  proteinG?: number; carbsG?: number; fatG?: number;
  /** HKSyncVersion. A later export of the same id must carry a higher one to replace it. */
  version?: number;
}
export interface HealthAdapter {
  initialize(): Promise<void>;
  readToday(now: Date): Promise<HealthSummary>;
  readWorkouts?(now: Date): Promise<HealthWorkout[]>;
  writeWorkout(workout: HealthWorkout): Promise<void>;
  writeDietaryEnergy(meal: HealthMeal): Promise<void>;
}
export function localDay(now: Date) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: now.toISOString(),
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` };
}
export function validateHealthWorkout(workout: HealthWorkout) {
  if (!workout.id || !workout.name.trim() || !Number.isFinite(Date.parse(workout.start))
    || !Number.isFinite(Date.parse(workout.end)) || Date.parse(workout.end) <= Date.parse(workout.start)) throw new Error('Enter a valid workout interval.');
}
export function validateHealthMeal(meal: HealthMeal) {
  if (!meal.id || !meal.name.trim() || !Number.isFinite(Date.parse(meal.date)) || !Number.isFinite(meal.caloriesKcal)
    || meal.caloriesKcal < 0 || meal.caloriesKcal > 100_000) throw new Error('Enter valid dietary energy in kcal.');
  // A macro may be absent; what it may not be is present and nonsense, which would export a
  // figure into Apple Health that nothing in the app could later explain.
  for (const grams of [meal.proteinG, meal.carbsG, meal.fatG]) {
    if (grams === undefined) continue;
    if (!Number.isFinite(grams) || grams < 0 || grams > 10_000) throw new Error('Enter valid macros in grams.');
  }
}
