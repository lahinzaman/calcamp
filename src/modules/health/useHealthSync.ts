import { breadcrumb } from '../telemetry/events';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { getHealthAdapter } from './healthAdapter';
import { localDay, validateHealthMeal, validateHealthWorkout, type HealthAdapter, type HealthMeal, type HealthSummary, type HealthWorkout } from './types';

interface HealthState extends HealthSummary {
  status: 'idle' | 'initializing' | 'ready' | 'error';
  error: string | null;
  initialized: boolean;
  refreshedAt: number | null;
  reset(): void;
  initialize(): Promise<void>;
  refresh(): Promise<void>;
  writeWorkout(workout: HealthWorkout): Promise<void>;
  writeDietaryEnergy(meal: HealthMeal): Promise<void>;
}
export function createHealthStore(loadAdapter: () => Promise<HealthAdapter> = getHealthAdapter, now = () => new Date(), durable = false) {
  let generation = 0;
  let adapter: HealthAdapter | undefined;
  let reading = false;
  let initializing = false;
  const written = new Set<string>();
  const writing = new Set<string>();
  async function writeOnce(id: string, run: () => Promise<void>) {
    if (written.has(id)) return;
    if (writing.has(id)) throw new Error('This health record is already being written.');
    writing.add(id);
    try { await run(); written.add(id); } finally { writing.delete(id); }
  }
  return createStore<HealthState>()((set, get) => ({
    steps: null, activeEnergyKcal: null, date: localDay(now()).date,
    status: 'idle', error: null, initialized: false, refreshedAt: null,
    reset: () => { generation++; adapter = undefined; written.clear(); set({ steps: null, activeEnergyKcal: null, initialized: false, status: 'idle', error: null, refreshedAt: null }); },
    initialize: async () => {
      if (initializing) return;
      const token = generation; initializing = true; breadcrumb('health.permission', { outcome: 'requested' }); set({ status: 'initializing', error: null });
      try { const loaded = await loadAdapter(); if (token !== generation) return; await loaded.initialize(); if (token !== generation) return; adapter = loaded;
        if (durable) { const { syncEngine } = await import('../sync/runtime'); if (token !== generation) return; if (syncEngine.owner) syncEngine.commit({ ...syncEngine.data, health: { ...syncEngine.data.health, enabled: true } }); }
        breadcrumb('health.permission', { outcome: 'ok' }); set({ initialized: true }); await get().refresh(); }
      catch (error) { if (token !== generation) return; breadcrumb('health.permission', { outcome: 'unavailable' }); set({ status: 'error', initialized: false, error: error instanceof Error ? error.message : 'Health sync is unavailable.' }); }
      finally { initializing = false; }
    },
    refresh: async () => {
      if (!get().initialized || reading) return;
      reading = true; const token = generation; const date = localDay(now()).date;
      if (get().date !== date) set({ date, steps: null, activeEnergyKcal: null, refreshedAt: null });
      try {
        adapter ??= await loadAdapter();
        const summary = durable ? await (await import('../sync/healthBatch')).runHealthBatch(adapter) : await adapter.readToday(now());
        if (!summary || token !== generation) return;
        if (summary.date !== localDay(now()).date) return;
        if ([summary.steps, summary.activeEnergyKcal].some(value => value !== null && (!Number.isFinite(value) || value < 0))) throw new Error('Invalid health summary.');
        const batchError = durable ? (await import('../sync/runtime')).syncEngine.data.health.error : null;
        if (token !== generation) return;
        set({ ...summary, status: 'ready', error: summary.steps === null ? 'Step read access is unavailable.' : batchError, refreshedAt: now().getTime() });
      } catch (error) { if (token !== generation) return; set({ status: 'error', steps: null, activeEnergyKcal: null, error: error instanceof Error ? error.message : 'Health read failed.' }); }
      finally { reading = false; }
    },
    writeWorkout: async workout => {
      validateHealthWorkout(workout);
      if (durable) { const { syncEngine, drainSync } = await import('../sync/runtime'); if (!syncEngine.owner || !syncEngine.data.health.enabled) throw new Error('Connect health before exporting.');
        syncEngine.queue({ kind: 'health-workout', data: workout }, `health-workout:${syncEngine.owner}:${workout.id}`); await drainSync(); return; }
      if (!adapter || !get().initialized) throw new Error('Connect health before writing a workout.');
      await writeOnce(`workout-${workout.id}`, () => adapter!.writeWorkout(workout));
    },
    writeDietaryEnergy: async meal => {
      validateHealthMeal(meal);
      if (durable) { const { syncEngine, drainSync } = await import('../sync/runtime'); if (!syncEngine.owner || !syncEngine.data.health.enabled) throw new Error('Connect health before exporting.');
        syncEngine.queue({ kind: 'health-meal', data: meal }, `health-meal:${syncEngine.owner}:${meal.id}`); await drainSync(); return; }
      if (!adapter || !get().initialized) throw new Error('Connect health before writing nutrition.');
      await writeOnce(`meal-${meal.id}`, () => adapter!.writeDietaryEnergy(meal));
    },
  }));
}
export const healthStore = createHealthStore(getHealthAdapter, () => new Date(), true);
export function useHealthSync() {
  const state = useStore(healthStore);
  useEffect(() => {
    const listener = AppState.addEventListener('change', status => { if (status === 'active') void healthStore.getState().refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void healthStore.getState().refresh(); }, 60_000);
    return () => { listener.remove(); clearInterval(timer); };
  }, []);
  return state;
}
