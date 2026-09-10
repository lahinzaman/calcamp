import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import { callbackCode, createCodeExchange } from '../auth/flows';
import { createAuthStore } from '../../store/authStore';
import { palettes } from '../../theme/palette';
import { useThemeStore } from '../../theme/store';
import { durableStorage } from '../sync/storage';
import { foodEmoji } from '../dining/foodEmoji';
import { PROGRAM } from '../workout/program';
test('PKCE callback rejects wrong origins and coalesces one-time code exchanges', async () => {
  const callback = 'calcamp://auth-callback';
  for (const bad of ['evil://auth-callback?code=123','calcamp://other?code=123','calcamp://auth-callback?error=access_denied','calcamp://auth-callback#access_token=123']) assert.throws(() => callbackCode(bad, callback));
  assert.throws(() => callbackCode('https://other.test/auth-callback?code=1','https://app.test/auth-callback'));
  let calls = 0; let fail = true;
  const exchange = createCodeExchange(() => ({ auth: { exchangeCodeForSession: async () => { calls++; return { data: { session: fail ? null : {} }, error: null }; } } } as unknown as SupabaseClient));
  await assert.rejects(exchange(callback+'?code=123', callback)); fail = false;
  await Promise.all([exchange(callback+'?code=123',callback), exchange(callback+'?code=123',callback)]);
  await exchange(callback+'?code=123',callback); assert.equal(calls, 2, 'failed exchange can retry; successful code is consumed once');
});
test('verified email and OAuth sessions hydrate profiles without requiring an email confirmation flag', async () => {
  const owners: string[] = [];
  const auth = createAuthStore(async id => { owners.push(id); return null; });
  auth.getState().setPendingSignup('old@example.test');
  auth.getState().acceptSession({ user: { id: 'email', email: 'student@example.test' } } as Session);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(auth.getState().pendingSignupEmail, null); assert.equal(auth.getState().profileStatus, 'ready'); assert.equal(auth.getState().profile, null);
  auth.getState().acceptSession({ user: { id: 'google', app_metadata: { provider: 'google' } } } as Session);
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(owners, ['email','google']); assert.equal(auth.getState().profileStatus, 'ready');
});
test('all themes meet text contrast on every semantic surface and persist explicit selection', () => {
  const luminance = (hex: string) => {
    const [r,g,b] = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    return .2126*r+.7152*g+.0722*b;
  };
  for (const palette of Object.values(palettes)) for (const surface of [palette.background,palette.surface,palette.raised,palette.accent]) {
    const values = [luminance(surface),luminance(palette.ink)].sort((a,b) => b-a);
    assert.ok((values[0]+.05)/(values[1]+.05) >= 4.5);
  }
  useThemeStore.getState().setMode('gray'); useThemeStore.setState({ mode: 'light' }); useThemeStore.getState().hydrate(); assert.equal(useThemeStore.getState().mode,'gray');
  durableStorage.remove('calcamp:theme'); useThemeStore.setState({ mode: 'light' });
  assert.equal(foodEmoji('Grilled chicken'),'🍗'); assert.equal(foodEmoji('Brown rice'),'🍚'); assert.equal(foodEmoji('Unclassified meal'),'🍽️');
  assert.deepEqual(PROGRAM.map(p => p.name), ['Upper A','Lower A','Upper B','Lower B']);
});
