import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: true });
mock.module('react-native', { namedExports: { View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', ScrollView: 'ScrollView', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios', Version: '18.0' }, Linking: { openURL: async () => {} } } });
mock.module('react-native-safe-area-context', { namedExports: { SafeAreaView: 'SafeAreaView' } });
mock.module('expo-application', { namedExports: { nativeApplicationVersion: '1.0.0', nativeBuildVersion: '5' } });
mock.module('expo-constants', { defaultExport: { expoConfig: {} } });
mock.module('expo-updates', { namedExports: { isEnabled: false, updateId: '8f4a2b99-test', runtimeVersion: 'runtime', channel: 'testing' } });
mock.module('expo-crypto', { namedExports: { randomUUID: () => 'retry-id' } });
mock.module('../notifications/NotificationSettings', { namedExports: { NotificationSettings: () => null } });
let deleted = 0; let submits = 0; const ids: unknown[] = [];
mock.module('../account/deleteAccount', { namedExports: { deleteAccount: async (owner: string) => { assert.equal(owner, 'alice'); deleted++; } } });
mock.module('../../api/supabase', { namedExports: { getSupabase: () => ({ rpc: async (_name: string, input: Record<string, unknown>) => {
  submits++; ids.push(input.p_id); assert.equal(input.p_owner, 'alice');
  assert.equal((input.p_context as Record<string, string>).build, '5');
  return { error: submits === 1 ? { code: 'NETWORK' } : null };
} }) } });
const { authStore } = require('../../store/authStore') as typeof import('../../store/authStore');
const { default: SettingsScreen } = require('../settings/SettingsScreen') as typeof import('../settings/SettingsScreen');
test('settings mounts app info, retains feedback across failed submission, and confirms deletion explicitly', async () => {
  authStore.setState({ session: { user: { id: 'alice' } } as Session });
  const client = new QueryClient(); let view!: ReactTestRenderer;
  const text = () => JSON.stringify(view.toJSON());
  const button = (label: string) => view.root.findAllByType('Pressable' as React.ElementType).find(node => node.findAllByType('Text' as React.ElementType).some(child => child.props.children === label))!;
  try {
    await act(async () => { view = create(<QueryClientProvider client={client}><SettingsScreen /></QueryClientProvider>); });
    assert.ok(text().includes('8f4a2b99')); assert.ok(text().includes('App Info'));
    await act(async () => button('Check for Updates').props.onPress()); assert.ok(text().includes('installed release build'));
    await act(async () => button('Send feedback or report a bug').props.onPress());
    await act(async () => view.root.findByProps({ accessibilityLabel: 'Your feedback' }).props.onChangeText('The dining menu could be clearer.'));
    await act(async () => button('Send report').props.onPress()); assert.ok(text().includes('draft is still here'));
    assert.equal(view.root.findByProps({ accessibilityLabel: 'Your feedback' }).props.value, 'The dining menu could be clearer.');
    await act(async () => button('Send report').props.onPress()); assert.deepEqual(ids, ['retry-id','retry-id']); assert.ok(text().includes('report has been saved'));
    await act(async () => button('Close').props.onPress());
    await act(async () => button('Delete account').props.onPress()); assert.equal(button('Delete my account').props.disabled, true); assert.equal(deleted, 0);
    await act(async () => view.root.findByProps({ accessibilityLabel: 'Type DELETE to confirm' }).props.onChangeText('DELETE'));
    await act(async () => button('Delete my account').props.onPress()); assert.equal(deleted, 1);
  } finally { await act(async () => view?.unmount()); client.clear(); authStore.setState({ session: null }); }
});
