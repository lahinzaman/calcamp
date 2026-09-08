import type { Session } from '@supabase/supabase-js';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { UserProfile } from '../types/profile';

interface AuthState {
  initialized: boolean;
  session: Session | null;
  profile: UserProfile | null;
  profileStatus: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  pendingSignupEmail: string | null;
  acceptSession: (session: Session | null) => void;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: UserProfile) => void;
  setPendingSignup: (email: string | null) => void;
  fail: (message: string) => void;
}
export function createAuthStore(readProfile: (id: string) => Promise<UserProfile | null> = async id =>
  (await import('../api/profile')).loadProfile(id)) {
  let generation = 0;
  return createStore<AuthState>()((set, get) => ({
    initialized: false, session: null, profile: null, profileStatus: 'idle', error: null, pendingSignupEmail: null,
    acceptSession: session => {
      const changed = get().session?.user.id !== session?.user.id;
      if (changed) generation++;
      set({ initialized: true, session, error: null,
        ...(session ? { pendingSignupEmail: null } : {}),
        ...(changed || !session ? { profile: null, profileStatus: session ? 'loading' : 'idle' } : {}) });
      if (session && changed) queueMicrotask(() => { void get().refreshProfile(); });
    },
    refreshProfile: async () => {
      const id = get().session?.user.id; if (!id) return;
      const token = ++generation;
      set({ profileStatus: 'loading', error: null });
      try {
        const profile = await readProfile(id);
        if (token === generation && get().session?.user.id === id) set({ profile, profileStatus: 'ready' });
      } catch (error) {
        if (token === generation) set({ profileStatus: 'error', error: error instanceof Error ? error.message : 'Unable to load your profile.' });
      }
    },
    setProfile: profile => {
      if (profile.id !== get().session?.user.id) return;
      generation++; set({ profile, profileStatus: 'ready', error: null });
    },
    setPendingSignup: pendingSignupEmail => set({ pendingSignupEmail }),
    fail: error => set({ initialized: true, error, profileStatus: 'error' }),
  }));
}
export const authStore = createAuthStore();
export const useAuthStore = <T,>(selector: (state: AuthState) => T) => useStore(authStore, selector);
