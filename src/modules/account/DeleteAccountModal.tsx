import { useRef, useState } from 'react';
import { Modal, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { Action, Field } from '../../components/FormControls';
import { deleteAccount } from './deleteAccount';
export function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const owner = useAuthStore(s => s.session?.user.id); const cache = useQueryClient();
  const [confirmation, setConfirmation] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const deleting = useRef(false);
  const remove = async () => {
    if (!owner || deleting.current || confirmation !== 'DELETE') return; deleting.current = true; setBusy(true); setError(null);
    try { await deleteAccount(owner); cache.clear(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Deletion unavailable. Please retry.'); }
    finally { deleting.current = false; setBusy(false); }
  };
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) onClose(); }}><SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
      <Text className="mb-4 text-2xl font-bold text-red-800">Delete account permanently</Text>
      <Text className="mb-4 text-base text-zinc-700">This removes your sign-in, cloud diary, workouts, activity backups, feedback and device diary, including unsynced edits. Food recognition history is removed when configured. This cannot be undone.</Text>
      <Text className="mb-4 text-zinc-600">Copies you exported to Apple Health or Health Connect remain under your control in those apps. Service backups and logs follow the privacy policy’s retention schedule.</Text>
      <Field label="Type DELETE to confirm" autoCapitalize="characters" autoCorrect={false} editable={!busy} value={confirmation} onChangeText={setConfirmation} />
      {error && <Text accessibilityRole="alert" className="mb-4 text-red-800">{error}</Text>}
      <Action label={busy ? 'Deleting account…' : 'Delete my account'} disabled={busy || confirmation !== 'DELETE'} onPress={() => void remove()} />
      <Action label="Cancel" secondary disabled={busy} onPress={onClose} />
    </ScrollView>
  </SafeAreaView></Modal>;
}
