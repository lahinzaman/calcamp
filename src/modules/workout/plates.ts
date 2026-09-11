/** Pounds available on a standard gym rack, heaviest first. */
export const PLATE_SIZES = [45, 35, 25, 10, 5, 2.5] as const;
export interface PlatePlan { perSide: number[]; achieved: number; remainder: number }
/** Greedy loading per side; 45s first. Reports what is actually loadable, not what was asked for. */
export function loadPlates(target: number, barWeight = 45, sizes: readonly number[] = PLATE_SIZES): PlatePlan | null {
  if (!Number.isFinite(target) || !Number.isFinite(barWeight) || barWeight < 0) return null;
  if (target < barWeight) return { perSide: [], achieved: barWeight, remainder: target - barWeight };
  let remaining = (target - barWeight) / 2;
  const perSide: number[] = [];
  for (const size of sizes) {
    while (remaining >= size - 1e-9) { perSide.push(size); remaining -= size; }
  }
  const achieved = barWeight + perSide.reduce((sum, plate) => sum + plate, 0) * 2;
  return { perSide, achieved, remainder: Number((target - achieved).toFixed(2)) };
}
export function describePlates(plan: PlatePlan | null) {
  if (!plan) return 'Enter a target weight.';
  if (!plan.perSide.length) return `Just the bar — ${plan.achieved} lbs.`;
  const counts = new Map<number, number>();
  for (const plate of plan.perSide) counts.set(plate, (counts.get(plate) ?? 0) + 1);
  return [...counts].map(([plate, count]) => `${count}×${plate}`).join(' + ') + ` per side = ${plan.achieved} lbs`;
}
