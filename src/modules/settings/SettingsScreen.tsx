import { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action } from '../../components/FormControls';
import { NotificationSettings } from '../notifications/NotificationSettings';
import { FeedbackModal } from '../feedback/FeedbackModal';
import { DeleteAccountModal } from '../account/DeleteAccountModal';
import { UpdateControls } from '../updates/UpdateControls';
import { useAuthStore } from '../../store/authStore';
import { appInfo } from './appInfo';
export default function SettingsScreen() {
  const owner = useAuthStore(s => s.session?.user.id); const [modal, setModal] = useState<'feedback' | 'delete' | null>(null);
  const [notice, setNotice] = useState<string | null>(null); const info = appInfo();
  const open = (url: string | undefined) => { if (!url?.startsWith('https://')) { setNotice('This link is not configured in this build.'); return; } void Linking.openURL(url).catch(() => setNotice('Unable to open this link.')); };
  return <SafeAreaView edges={['top','left','right']} className="flex-1 bg-[#F7F7F2]">
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <Text className="mb-5 text-3xl font-bold text-zinc-950">Settings</Text>
      <View className="rounded-2xl bg-white p-4"><Text className="mb-2 text-lg font-bold">App Info</Text>
        <Text selectable className="text-zinc-700">Version {info.app_version} (Build {info.build}) · Update: {info.update_id === 'embedded' ? 'embedded' : info.update_id.slice(0, 8)}</Text>
        <Text selectable className="mt-2 text-xs text-zinc-600">Channel: {info.channel} · Runtime: {info.runtime}</Text>
      </View>
      <UpdateControls /><NotificationSettings />
      <Action label="Send feedback or report a bug" onPress={() => setModal('feedback')} />
      <Action label="Privacy policy" secondary onPress={() => open(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL)} />
      <Action label="Help & support" secondary onPress={() => open(process.env.EXPO_PUBLIC_SUPPORT_URL)} />
      {notice && <Text accessibilityRole="alert" className="mb-4 text-zinc-700">{notice}</Text>}
      <View className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4"><Text className="mb-3 font-bold text-red-800">Account</Text>
        <Action label="Delete account" onPress={() => setModal('delete')} disabled={!owner} />
      </View>
    </ScrollView>
    {modal === 'feedback' && owner && <FeedbackModal key={owner} onClose={() => setModal(null)} />}
    {modal === 'delete' && owner && <DeleteAccountModal key={owner} onClose={() => setModal(null)} />}
  </SafeAreaView>;
}
