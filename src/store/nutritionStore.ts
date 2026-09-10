import { syncBridge } from '../modules/sync/bridge';
import type { TrackingRepository } from '../api/trackingRepository';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { DiningHallSlug } from '../types/campus';
import {
  emptyMacros,
  NUTRIENT_UNITS,
  type MacroTotals,
  type MicronutrientTotals,
  type NutritionTargets,
  type NutrientKey,
} from '../types/nutrition';

export interface NutritionState {
  /** Device-local calendar date, YYYY-MM-DD; never an ISO UTC slice. */
  date: string;
  consumedMacros: MacroTotals;
  consumedMicros: MicronutrientTotals;
  dailyTargets: NutritionTargets | null;
  activeDiningHall: DiningHallSlug | null;
  isAdherent: boolean;
  bodyWeightLbs: number | null;
  cloudOwnerId: string | null;
  cloudDate: string | null;
  syncStatus: 'idle' | 'loading' | 'saving' | 'saved' | 'error';
  syncError: string | null;
}

export interface NutritionActions {
  loadToday: () => Promise<void>;
  saveToday: () => Promise<void>;
  setBodyWeightLbs: (weight: number | null) => void;
  setConsumed: (macros: MacroTotals, micronutrients?: MicronutrientTotals) => void;
  addConsumed: (macros: MacroTotals, micronutrients?: MicronutrientTotals) => void;
  setDailyTargets: (targets: NutritionTargets | null) => void;
  setActiveDiningHall: (diningHall: DiningHallSlug | null) => void;
  setIsAdherent: (isAdherent: boolean) => void;
  /** Call on app foreground and before reading/logging a new day's totals. */
  syncToday: (now?: Date) => void;
  /** Clears totals/adherence while retaining targets and the selected hall. */
  resetToday: (now?: Date) => void;
  /** Clears all account-local state, including targets and location, on logout. */
  reset: () => void;
}

export type NutritionStore = NutritionState & NutritionActions;

export function localDateKey(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid nutrition date.');
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function validateAmount(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, nonnegative amount.`);
  }
}

function copyMacros(macros: MacroTotals): MacroTotals {
  const copy: MacroTotals = {
    caloriesKcal: macros.caloriesKcal,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
  };
  for (const [key, amount] of Object.entries(copy)) validateAmount(amount, key);
  return copy;
}

function copyMicros(micros: MicronutrientTotals): MicronutrientTotals {
  const copy: MicronutrientTotals = {};
  for (const [key, amount] of Object.entries(micros)) {
    if (!Object.hasOwn(NUTRIENT_UNITS, key)) throw new TypeError(`Unknown nutrient: ${key}`);
    // An optional key explicitly set to undefined has the same meaning as an omitted key.
    if (amount === undefined) continue;
    validateAmount(amount, key);
    copy[key as NutrientKey] = amount;
  }
  return copy;
}

function freshDay(now: Date) {
  return {
    date: localDateKey(now),
    consumedMacros: emptyMacros(),
    consumedMicros: {} as MicronutrientTotals,
    isAdherent: false,
    bodyWeightLbs: null as number | null,
    cloudDate: null as string | null,
    syncStatus: 'idle' as const,
    syncError: null as string | null,
  };
}

/** A separate factory instance keeps tests and future per-account hydration isolated. */
export function createNutritionStore(options: { now?: () => Date; repository?: TrackingRepository; beforeChange?: (next: NutritionState, previous: NutritionState) => void; durable?: boolean } = {}) {
  const now = options.now ?? (() => new Date());
  let generation = 0;
  let inFlight = false;
  const repo = async () => options.repository ?? (await import('../api/trackingRepository')).getTrackingRepository();
  return createStore<NutritionStore>()((rawSet, get) => {
    const set = (patch: Partial<NutritionStore> | ((state: NutritionStore) => Partial<NutritionStore>)) => {
      const previous = get(); const delta = typeof patch === 'function' ? patch(previous) : patch;
      options.beforeChange?.({ ...previous, ...delta }, previous);
      rawSet(delta);
    };
    return ({
    ...freshDay(now()),
    cloudOwnerId: null,
    dailyTargets: null,
    activeDiningHall: null,
    setBodyWeightLbs: (bodyWeightLbs) => {
      if (bodyWeightLbs !== null && (!Number.isFinite(bodyWeightLbs) || bodyWeightLbs < 2 || bodyWeightLbs > 2204)) throw new RangeError('Weight must be 2–2204 lbs.');
      get().syncToday(); set({ bodyWeightLbs, syncStatus: 'idle' });
    },
    loadToday: async () => {
      if (options.durable && syncBridge.refresh) return syncBridge.refresh();
      if (inFlight) return;
      get().syncToday();
      const snapshot = get();
      if (Object.values(snapshot.consumedMacros).some(value => value !== 0) || Object.keys(snapshot.consumedMicros).length || snapshot.bodyWeightLbs !== null || snapshot.isAdherent) {
        set({ syncStatus: 'error', syncError: 'Load the cloud diary before entering local totals, or save your current edits.' }); return;
      }
      const token = generation; inFlight = true; set({ syncStatus: 'loading', syncError: null });
      try {
        const db = await repo(); const owner = await db.userId();
        if (snapshot.cloudOwnerId && snapshot.cloudOwnerId !== owner) throw new Error('Reset local state before changing accounts.');
        const day = await db.loadDay(owner, snapshot.date);
        if (token !== generation) return;
        if (get().date !== snapshot.date || get().consumedMacros !== snapshot.consumedMacros
          || get().consumedMicros !== snapshot.consumedMicros || get().bodyWeightLbs !== snapshot.bodyWeightLbs || get().isAdherent !== snapshot.isAdherent) throw new Error('Diary changed while loading. Try again without editing.');
        set({ ...(day ? { consumedMacros: copyMacros(day.consumedMacros), consumedMicros: copyMicros(day.consumedMicros),
          bodyWeightLbs: day.bodyWeightLbs, isAdherent: day.isAdherent } : {}),
          cloudOwnerId: owner, cloudDate: snapshot.date, syncStatus: 'saved' });
      } catch (error) { if (token === generation) set({ syncStatus: 'error', syncError: error instanceof Error ? error.message : 'Cloud load failed.' }); }
      finally { inFlight = false; }
    },
    saveToday: async () => {
      if (options.durable && syncBridge.drain) return syncBridge.drain();
      if (inFlight) return;
      get().syncToday(); const snapshot = get(); const token = generation;
      inFlight = true; set({ syncStatus: 'saving', syncError: null });
      try {
        const db = await repo(); const owner = await db.userId();
        if (token !== generation) return;
        if (snapshot.cloudOwnerId && snapshot.cloudOwnerId !== owner) throw new Error('Reset local state before changing accounts.');
        set({ cloudOwnerId: owner });
        if (snapshot.cloudDate !== snapshot.date && await db.loadDay(owner, snapshot.date)) {
          throw new Error('A cloud diary already exists for today. Load it before editing to avoid overwriting it.');
        }
        if (token !== generation) return;
        await db.saveDay(owner, snapshot);
        if (token === generation && get().date === snapshot.date) set({ cloudDate: snapshot.date,
          syncStatus: get().consumedMacros === snapshot.consumedMacros && get().consumedMicros === snapshot.consumedMicros
            && get().bodyWeightLbs === snapshot.bodyWeightLbs && get().isAdherent === snapshot.isAdherent ? 'saved' : 'idle' });
      } catch (error) { if (token === generation) set({ syncStatus: 'error', syncError: error instanceof Error ? error.message : 'Cloud save failed.' }); }
      finally { inFlight = false; }
    },
    setConsumed: (macros, micronutrients = {}) => {
      const consumedMacros = copyMacros(macros);
      const consumedMicros = copyMicros(micronutrients);
      const today = freshDay(now());
      set((state) => ({
        ...(state.date === today.date ? {} : today),
        consumedMacros,
        consumedMicros,
        syncStatus: 'idle',
      }));
    },
    addConsumed: (macros, micronutrients = {}) => {
      const addedMacros = copyMacros(macros);
      const addedMicros = copyMicros(micronutrients);
      const today = freshDay(now());
      set((state) => {
        const current = state.date === today.date ? state : today;
        const consumedMacros = copyMacros({
          caloriesKcal: current.consumedMacros.caloriesKcal + addedMacros.caloriesKcal,
          proteinG: current.consumedMacros.proteinG + addedMacros.proteinG,
          carbsG: current.consumedMacros.carbsG + addedMacros.carbsG,
          fatG: current.consumedMacros.fatG + addedMacros.fatG,
        });
        const consumedMicros = { ...current.consumedMicros };
        for (const key of Object.keys(addedMicros) as NutrientKey[]) {
          const total = (consumedMicros[key] ?? 0) + addedMicros[key]!;
          validateAmount(total, key);
          consumedMicros[key] = total;
        }
        return { ...(state.date === today.date ? {} : today), consumedMacros, consumedMicros, syncStatus: 'idle' };
      });
    },
    setDailyTargets: (targets) => {
      set({
        dailyTargets: targets === null ? null : {
          macros: copyMacros(targets.macros),
          micronutrients: copyMicros(targets.micronutrients),
        },
      });
    },
    setActiveDiningHall: (activeDiningHall) => set({ activeDiningHall }),
    setIsAdherent: (isAdherent) => {
      const today = freshDay(now());
      set((state) => ({ ...(state.date === today.date ? {} : today), isAdherent, syncStatus: 'idle' }));
    },
    syncToday: (date = now()) => {
      const day = localDateKey(date);
      set((state) => state.date === day ? state : freshDay(date));
    },
    resetToday: (date = now()) => set(freshDay(date)),
    reset: () => { generation++; set({ ...freshDay(now()), cloudOwnerId: null, dailyTargets: null, activeDiningHall: null }); },
  }); });
}

export const nutritionStore = createNutritionStore({ durable: true, beforeChange: (next, previous) => syncBridge.nutrition?.(next, previous) });

export function useNutritionStore<T>(selector: (state: NutritionStore) => T): T {
  return useStore(nutritionStore, selector);
}
