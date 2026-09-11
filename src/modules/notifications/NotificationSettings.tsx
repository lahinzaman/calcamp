import { SafeAreaView } from '../../theme/SafeArea';
import { useEffect, useState } from 'react';
import { Modal, Switch, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { Text, TextInput } from '../../theme/primitives';
import { useAuthStore } from '../../store/authStore';
import { defaultPreferences, parsePreferences, type NotificationPreferences } from './policy';
import { readPreferences, savePreferences } from './preferences';
import { configureNotifications } from './service';
import { configureGeofencing } from '../background/geofencing';
export function NotificationSettings() {
  const owner = useAuthStore(s => s.session?.user.id); const profile = useAuthStore(s => s.profile);
  const [settings, setSettings] = useState<NotificationPreferences>(defaultPreferences);
  const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { setSettings(owner ? readPreferences(owner) : defaultPreferences); setNotice(null); setVisible(false); }, [owner]);
  const save = async () => {
    if (!owner) return; setBusy(true); setNotice(null);
    try {
      const p = parsePreferences(settings); savePreferences(owner, p);
      const errors: string[] = [];
      try { await configureNotifications(owner, p, profile, true); } catch (error) { errors.push(error instanceof Error ? error.message : 'Notification permissions need attention.'); }
      try { await configureGeofencing(owner, p.geofencing, true); } catch (error) { errors.push(error instanceof Error ? error.message : 'Location permissions need attention.'); }
      setNotice(errors.length ? errors.join(' ') : 'Settings saved. Reminders follow your device’s local time.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Settings could not be saved.'); }
    finally { setBusy(false); }
  };
  return <View className="my-5 rounded-2xl bg-surface p-5">
    <Pressable accessibilityRole="button" onPress={() => setVisible(true)}><Text className="font-bold text-ink">Reminders & background activity</Text><Text className="mt-2 text-ink">Choose alerts, campus arrivals and health uploads.</Text></Pressable>
    <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)} presentationStyle="pageSheet">
      {visible && <SettingsBody settings={settings} setSettings={setSettings} busy={busy} notice={notice} save={() => void save()} close={() => setVisible(false)} />}
    </Modal>
  </View>;
}
import { ScrollView } from 'react-native';
function SettingsBody({ settings, setSettings, busy, notice, save, close }: { settings: NotificationPreferences; setSettings: (p: NotificationPreferences) => void; busy: boolean; notice: string | null; save: () => void; close: () => void }) {
  return <SafeAreaView className="flex-1 bg-background"><ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
    <Text className="mb-5 text-2xl font-bold">Make reminders yours</Text>
    {([['enabled','Allow notifications'],['gymAlerts','Quiet-gym alerts'],['workoutReminders','Upper / Lower reminders'],['nutritionReminders','Meal / planned refeed reminder'],['weighInReminders','Weekly weigh-in reminder'],['geofencing','Campus arrival alerts'],['uploadActivity','Back up steps & active energy']] as const).map(([key,label]) => <View key={key} className="my-2 flex-row items-center justify-between gap-3"><Text className="flex-1 text-base">{label}</Text><Switch accessibilityLabel={label} value={settings[key]} onValueChange={value => setSettings({ ...settings, [key]: value })} /></View>)}
    <Text className="mt-4 text-sm text-ink">Campus arrivals use low-power region monitoring and require Always Allow location. CalCamp does not continuously record your route. You can turn this off here at any time.</Text>
    <Text className="mt-3 text-sm text-ink">Health backup uploads daily steps and active energy to your private Supabase account after you connect Health. These snapshots never add to food calories. Background timing is controlled by iOS/Android.</Text>
    {settings.weighInReminders && <View className="mt-5"><Text className="mb-2">Weigh-in day</Text><View className="flex-row flex-wrap">
      {(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const).map((label, day) => <Pressable key={label} accessibilityRole="radio"
        accessibilityState={{ checked: settings.weighInDay === day }} accessibilityLabel={label} onPress={() => setSettings({ ...settings, weighInDay: day })}
        className={`mb-2 mr-2 rounded-xl border px-4 py-3 ${settings.weighInDay === day ? 'border-border bg-raised' : 'border-border bg-surface'}`}>
        <Text className={settings.weighInDay === day ? 'font-bold' : ''}>{label}</Text></Pressable>)}
    </View></View>}
    {([['workoutTime','Workout time (24-hour HH:MM)'],['nutritionTime','Nutrition time (24-hour HH:MM)'],['weighInTime','Weigh-in time (24-hour HH:MM)']] as const).map(([key,label]) => <View key={key} className="mt-5"><Text className="mb-2">{label}</Text><TextInput accessibilityLabel={label} value={settings[key]} onChangeText={value => setSettings({ ...settings, [key]: value })} className="rounded-xl border border-border p-3" /></View>)}
    <Text className="mb-2 mt-5">Gym alert threshold · relative busyness, not capacity</Text>
    <TextInput accessibilityLabel="Gym alert threshold" keyboardType="number-pad" value={String(settings.gymThreshold)} onChangeText={text => setSettings({ ...settings, gymThreshold: Number(text) })} className="rounded-xl border border-border p-3" />
    <Text className="mt-3 text-sm text-ink">Gym alerts use fresh provider estimates and arrive between 8 AM and 10 PM in your registered time zone. They do not confirm opening hours. Training reminders use your advanced-track schedule.</Text>
    {notice && <Text accessibilityRole="alert" className="mt-4 text-ink">{notice}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} className="mt-6 rounded-xl bg-accent p-4" onPress={save}><Text className="text-center font-bold text-ink">{busy ? 'Saving…' : 'Save settings'}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} className="mt-3 p-4" onPress={close}><Text className="text-center">Close</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
