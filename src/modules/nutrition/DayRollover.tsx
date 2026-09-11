import { useEffect } from 'react';
import { AppState } from 'react-native';
import { localDateKey, nutritionStore } from '../../store/nutritionStore';
import { startDayRollover } from './rollover';
/** Mounted once at the root: rolls the diary over at local midnight and on resume. */
export function DayRollover() {
  useEffect(() => {
    const rollover = startDayRollover(nutritionStore.getState().date, () => {
      // syncToday replaces state with a fresh day; the completed day is already
      // committed to the offline snapshot and the cloud, so it stays readable.
      nutritionStore.getState().syncToday();
    }, { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: handle => clearTimeout(handle), now: () => new Date() }, localDateKey);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') rollover.check(); });
    return () => { rollover.stop(); subscription.remove(); };
  }, []);
  return null;
}
