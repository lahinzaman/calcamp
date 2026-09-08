/** Brzycki estimate in the same weight unit as input. Limit to useful 1–12 rep sets. */
export function estimateBrzyckiOneRepMax(weight: number | null, reps: number | null): number | null {
  if (weight === null || reps === null || !Number.isFinite(weight) || weight <= 0
    || !Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  const estimate = weight * (36 / (37 - reps));
  return Number.isFinite(estimate) ? estimate : null;
}
