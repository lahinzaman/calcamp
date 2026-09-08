import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '../../types/profile';
import { createAuthStore } from '../authStore';
const session = (id: string) => ({ user: { id }, access_token: id } as Session);
const flush = () => new Promise(resolve => setImmediate(resolve));
test('auth gate waits for profile and closes immediately on account change or logout', async () => {
  const pending = new Map<string, (profile: UserProfile | null) => void>();
  const store = createAuthStore(id => new Promise(resolve => pending.set(id, resolve)));
  store.getState().acceptSession(session('alice')); await flush();
  assert.equal(store.getState().profileStatus, 'loading');
  store.getState().acceptSession(session('bob')); await flush();
  pending.get('alice')!({ id: 'alice', onboarding_completed_at: 'now' } as UserProfile); await flush();
  assert.equal(store.getState().profile, null, 'old account response must be discarded');
  pending.get('bob')!({ id: 'bob', onboarding_completed_at: 'now' } as UserProfile); await flush();
  assert.equal(store.getState().profile?.id, 'bob');
  store.getState().acceptSession(null);
  assert.equal(store.getState().profile, null); assert.equal(store.getState().session, null);
});
test('email confirmation draft grants no session; profile errors stay closed and can retry', async () => {
  let fail = true;
  const store = createAuthStore(async () => { if (fail) throw new Error('Database offline'); return null; });
  store.getState().setPendingSignup('student@example.com'); assert.equal(store.getState().session, null);
  store.getState().acceptSession(session('alice')); await flush();
  assert.equal(store.getState().pendingSignupEmail, null); assert.equal(store.getState().profileStatus, 'error');
  fail = false; await store.getState().refreshProfile();
  assert.equal(store.getState().profileStatus, 'ready'); assert.equal(store.getState().profile, null);
});
test('token refresh preserves profile and an obsolete load cannot overwrite saved onboarding', async () => {
  let resolve!: (value: UserProfile | null) => void;
  const store = createAuthStore(() => new Promise(r => { resolve = r; }));
  store.getState().acceptSession(session('alice')); await flush();
  const profile = { id: 'alice', onboarding_completed_at: 'now' } as UserProfile;
  store.getState().setProfile(profile); resolve(null); await flush();
  store.getState().acceptSession(session('alice'));
  assert.equal(store.getState().profile, profile); assert.equal(store.getState().profileStatus, 'ready');
});
