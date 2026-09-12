import { EXERCISE_CATALOG } from './catalog';
import type { LiftHistory } from './history';

/**
 * The three competition lifts, and the variants that count as the same lift for a total.
 * Deliberately narrow: partial-range work (rack pulls, block pulls) and different lifts
 * wearing a similar name (front squat, trap-bar deadlift, floor press) are excluded,
 * because a total assembled from those is not comparable to anyone else's.
 */
export const BIG_THREE = [
  { key: 'squat', label: 'Squat', names: ['High-Bar Back Squat', 'Low-Bar Back Squat', 'Paused Back Squat', 'Anderson Squat', 'Box Squat', 'Safety-Bar Squat'] },
  { key: 'bench', label: 'Bench press', names: ['Barbell Bench Press', 'Paused Barbell Bench Press', 'Larsen Press', 'Guillotine Press'] },
  { key: 'deadlift', label: 'Deadlift', names: ['Conventional Deadlift', 'Sumo Deadlift', 'Deficit Deadlift'] },
] as const;
export type BigThreeKey = typeof BIG_THREE[number]['key'];

const idsFor = (names: readonly string[]) =>
  EXERCISE_CATALOG.filter(exercise => names.includes(exercise.name)).map(exercise => exercise.id);

export interface BigThreeLift {
  key: BigThreeKey; label: string;
  bestWeightLbs: number; bestOneRepMaxLbs: number;
  exerciseName: string; lastPerformedMs: number; sessions: number;
}
export interface BigThreeSummary { lifts: BigThreeLift[]; missing: string[]; totalLbs: number | null; estimatedTotalLbs: number | null }

/** The heaviest single set and the best estimated max across each lift's accepted variants. */
export function bigThree(history: LiftHistory): BigThreeSummary {
  const lifts: BigThreeLift[] = [];
  const missing: string[] = [];
  for (const lift of BIG_THREE) {
    const records = idsFor(lift.names).map(id => history[id]).filter(Boolean);
    if (!records.length) { missing.push(lift.label); continue; }
    const best = records.reduce((leader, record) => record.bestOneRepMaxLbs > leader.bestOneRepMaxLbs ? record : leader);
    lifts.push({
      key: lift.key, label: lift.label,
      bestWeightLbs: Math.max(...records.map(record => record.bestWeightLbs)),
      bestOneRepMaxLbs: Math.max(...records.map(record => record.bestOneRepMaxLbs)),
      exerciseName: EXERCISE_CATALOG.find(exercise => exercise.id === best.exerciseId)?.name ?? lift.label,
      lastPerformedMs: Math.max(...records.map(record => record.lastPerformedMs)),
      sessions: records.reduce((sum, record) => sum + record.sessions, 0),
    });
  }
  // A total means nothing until all three are in it, so it stays null rather than misleading.
  const complete = lifts.length === BIG_THREE.length;
  return {
    lifts, missing,
    totalLbs: complete ? lifts.reduce((sum, lift) => sum + lift.bestWeightLbs, 0) : null,
    estimatedTotalLbs: complete ? lifts.reduce((sum, lift) => sum + lift.bestOneRepMaxLbs, 0) : null,
  };
}
