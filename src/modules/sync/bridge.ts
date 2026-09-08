import type { NutritionState } from '../../store/nutritionStore';
import type { WorkoutState } from '../../store/workoutStore';
export const syncBridge: {
  nutrition?: (next: NutritionState, previous: NutritionState) => void;
  workout?: (next: WorkoutState, previous: WorkoutState) => void;
  drain?: () => Promise<void>;
  refresh?: () => Promise<void>;
} = {};
