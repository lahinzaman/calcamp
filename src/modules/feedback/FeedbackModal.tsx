import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { Action, Choice, Field } from '../../components/FormControls';
import { useAuthStore } from '../../store/authStore';
import { appInfo } from '../settings/appInfo';
import { submitFeedback } from './api';
import { FEEDBACK_CATEGORIES, type FeedbackInput, type FeedbackCategory } from './model';
export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const owner = useAuthStore(s => s.session?.user.id);
  const [category, setCategory] = useState<FeedbackCategory>('bug'); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null); const [sent, setSent] = useState(false);
  const attempt = useRef<FeedbackInput | null>(null); const sending = useRef(false);
  const edit = () => { attempt.current = null; setNotice(null); };
  const send = async () => {
    if (!owner || sending.current) return; sending.current = true; setBusy(true); setNotice(null);
    attempt.current ??= { id: randomUUID(), category, message, context: appInfo() };
    try { await submitFeedback(owner, attempt.current); setSent(true); setMessage(''); setNotice('Thank you. Your report has been saved.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to send your report.'); }
    finally { sending.current = false; setBusy(false); }
  };
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
        <Text className="mb-4 text-2xl font-bold text-zinc-950">Send feedback</Text>
        {!sent && <>{FEEDBACK_CATEGORIES.map(value => <Choice key={value} label={value === 'bug' ? 'Report a bug' : value === 'feature' ? 'Request a feature' : 'Other feedback'} selected={category === value} onPress={() => { if (!busy) { edit(); setCategory(value); } }} />)}
          <Field label="Your feedback" multiline maxLength={4000} editable={!busy} value={message} onChangeText={text => { edit(); setMessage(text); }} style={{ minHeight: 160, textAlignVertical: 'top' }} />
          <Text className="mb-4 text-sm text-zinc-600">Includes your account ID, OS version, app build and update ID so we can investigate. Please leave out passwords, health details and other sensitive information.</Text>
          <Action label={busy ? 'Sending…' : 'Send report'} disabled={busy || !owner} onPress={() => void send()} /></>}
        {notice && <Text accessibilityRole="alert" className="mb-4 text-zinc-800">{notice}</Text>}
        <Action label="Close" secondary disabled={busy} onPress={onClose} />
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
