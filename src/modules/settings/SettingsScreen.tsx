import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';
import { Action, Choice } from '../../components/FormControls';
import { Reveal } from '../../theme/motion';
import { useThemeStore } from '../../theme/store';
import { THEMES } from '../../theme/palette';
import { useSyncStatus } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';
import { NotificationSettings } from '../notifications/NotificationSettings';
import { HealthConnectCard } from '../health/HealthConnectCard';
import { PermissionsCard } from '../onboarding/PermissionsCard';
import { UpdateControls } from '../updates/UpdateControls';
import { FeedbackModal } from '../feedback/FeedbackModal';
import { AccountAccess } from '../account/AccountAccess';
import { TargetEditor } from './TargetEditor';
import { GoalEditor } from './GoalEditor';
import { ExportControls } from './ExportControls';
export async function checkService(signal: AbortSignal): Promise<boolean> {
  const base = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!base) return false;
  const controller = new AbortController(); const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
  const timer = setTimeout(cancel, 10000);
  try {
    const response = await fetch(new URL('/health', base), { signal: controller.signal });
    if (!response.ok) return false;
    const value = await response.json(); return value.status === 'ok' && value.database === 'ok';
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
function Section({ title, children, index }: { title: string; children: React.ReactNode; index: number }) {
  return <Reveal index={index}><View className="mb-4 rounded-3xl bg-surface p-5">
    <Text className="mb-3 text-sm font-bold tracking-widest">{title.toUpperCase()}</Text>
    {children}
  </View></Reveal>;
}
export default function SettingsScreen() {
  const s = useSyncStatus();
  const mode = useThemeStore(state => state.mode);
  const profile = useAuthStore(state => state.profile);
  const [targets, setTargets] = useState(false); const [feedback, setFeedback] = useState(false);
  const [goal, setGoal] = useState(false);
  const survey = (profile?.lifestyle_survey ?? {}) as { goalDirection?: string; rateLbsPerWeek?: number; goalWeightLbs?: number | null };
  const goalLine = [
    profile?.weight_lbs ? `${Number(profile.weight_lbs.toFixed(1))} lbs now` : 'No weight on file',
    ({ lose: 'losing', gain: 'gaining', maintain: 'maintaining', recomp: 'recomposing', auto: 'letting CalCamp decide' } as Record<string, string>)[survey.goalDirection ?? 'auto'],
    survey.goalWeightLbs ? `towards ${survey.goalWeightLbs} lbs` : null,
  ].filter(Boolean).join(' · ');
  const service = useQuery({ queryKey: ['service-health'], queryFn: ({ signal }) => checkService(signal), enabled: s.online,
    refetchInterval: 60000, retry: false, staleTime: 30000 });
  const label = !s.online ? 'Offline' : s.blocked ? 'Sync needs review' : s.syncing ? 'Syncing…' : s.queued ? `${s.queued} queued` : !s.ready || service.isPending ? 'Checking…' : service.isError || !service.data || s.error ? 'Connection unavailable' : s.lastSyncedAt ? 'Synced' : 'Waiting for first sync';
  const rest = profile?.rest_targets;
  return <SafeAreaView edges={['top','left','right']} className="flex-1 bg-background">
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <Reveal index={0}><Text className="mb-5 text-4xl font-bold">Settings</Text></Reveal>
      <Section title="Service status" index={1}>
        <Text accessibilityLiveRegion="polite" className="text-3xl font-bold">{label}</Text>
      </Section>
      <Section title="Goal & weight" index={2}>
        <Text className="mb-3">{goalLine}</Text>
        <Action label="Update my goal" onPress={() => setGoal(true)} />
      </Section>
      <Section title="Daily targets" index={2}>
        <Text className="mb-3">{rest ? `${Math.round(rest.caloriesKcal)} kcal · P ${Math.round(rest.proteinG)} g · C ${Math.round(rest.carbsG)} g · F ${Math.round(rest.fatG)} g` : 'No targets set yet.'}</Text>
        <Action label="Adjust targets" onPress={() => setTargets(true)} />
      </Section>
      <Section title="Appearance" index={3}>
        <Text className="mb-3">Choose the surface that is easiest on your eyes.</Text>
        <View className="flex-row flex-wrap">{THEMES.map(theme => <Choice key={theme} label={theme[0].toUpperCase() + theme.slice(1)} selected={theme === mode} onPress={() => useThemeStore.getState().setMode(theme)} />)}</View>
      </Section>
      <Section title="Notifications" index={4}><PermissionsCard /><NotificationSettings /></Section>
      <Section title="Apple Health & Health Connect" index={5}><HealthConnectCard /></Section>
      <Reveal index={5}><UpdateControls /></Reveal>
      <Section title="Your data" index={6}><ExportControls /></Section>
      <Section title="Help & account" index={7}>
        <Action secondary label="Send feedback" onPress={() => setFeedback(true)} />
        <AccountAccess />
      </Section>
      {targets && <TargetEditor onClose={() => setTargets(false)} />}
      {goal && <GoalEditor onClose={() => setGoal(false)} />}
      {feedback && <FeedbackModal onClose={() => setFeedback(false)} />}
    </ScrollView>
  </SafeAreaView>;
}
