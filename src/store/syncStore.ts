import { create } from 'zustand';
export const useSyncStatus = create<{
  ready: boolean; online: boolean; queued: number; blocked: number; syncing: boolean; error: string | null; lastSyncedAt: number | null;
}>(() => ({ ready: false, online: true, queued: 0, blocked: 0, syncing: false, error: null, lastSyncedAt: null }));
