import { NotificationSettings } from '../notifications/NotificationSettings';
import { LoadingCards } from '../../components/LoadingCards';
import { SyncIndicator } from '../../components/SyncIndicator';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollView, View } from 'react-native';
import { Text } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';
import { useState } from 'react';
import { fetchGymBaselines, fetchGymForecast, fetchGymSummary, submitGymVote } from '../../api/campus';
import { gymEstimate } from './estimate';
import { GYMS, type CrowdStatus, type GymSlug } from '../../types/facilities';
import { useAuthStore } from '../../store/authStore';
import { Action, Choice } from '../../components/FormControls';
import { signOutWithDeviceCleanup } from '../notifications/logout';
import { DEFAULT_UPPER_LOWER } from '../../types/profile';
export default function GymStatus() {
  const user = useAuthStore(s => s.session?.user.id); const profile = useAuthStore(s => s.profile);
  const [notice, setNotice] = useState<string | null>(null);
  const cache = useQueryClient();
  // The provider forecast is now the last resort, so it no longer polls every minute: an
  // unconfigured or unreachable backend should cost one quiet failure, not sixty an hour.
  const baseline = useQuery({ queryKey: ['gym-baselines', user], queryFn: ({ signal }) => fetchGymBaselines(signal), enabled: !!user, retry: 1, staleTime: 600_000, refetchInterval: 600_000 });
  const crowd = useQuery({ queryKey: ['gym-crowd', user], queryFn: ({ signal }) => fetchGymSummary(signal), enabled: !!user, staleTime: 0, refetchInterval: 30_000 });
  const forecast = useQuery({ queryKey: ['gym-forecast', user], queryFn: ({ signal }) => fetchGymForecast(signal), enabled: !!user, staleTime: 300_000, refetchInterval: 900_000 });
  const vote = useMutation({ mutationFn: ({ slug, status }: { slug: GymSlug; status: CrowdStatus }) => submitGymVote(slug, status),
    onSuccess: () => { setNotice('Your report is included for the next 30 minutes, and it sharpens this hour’s forecast from now on.');
      void cache.invalidateQueries({ queryKey: ['gym-crowd', user] }); void cache.invalidateQueries({ queryKey: ['gym-forecast', user] }); } });
  return <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background"><ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 50, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
    <Text className="text-sm font-bold uppercase tracking-widest text-ink">Rutgers recreation</Text><Text className="mb-3 mt-2 text-3xl font-bold text-ink">Find your space</Text>
    <Text className="mb-6 text-ink">A report from someone standing in the gym beats any forecast, so those come first. Otherwise this shows what students have reported for this hour in the past. Nothing here measures physical capacity or confirms opening hours.</Text>
    <SyncIndicator /><NotificationSettings />
    {(forecast.isPending || crowd.isPending) && <LoadingCards label="Checking gym activity…" />}
    {GYMS.map(gym => {
      const estimate = gymEstimate({
        report: crowd.isError ? undefined : crowd.data?.find(c => c.location_slug === gym.slug),
        forecast: forecast.isError ? undefined : forecast.data?.find(f => f.location_slug === gym.slug),
        baseline: baseline.isError ? undefined : baseline.data?.find(b => b.slug === gym.slug),
      });
      return <View key={gym.slug} className="mb-5 rounded-3xl border border-border bg-surface p-5">
        <Text className="text-xl font-bold text-ink">{gym.name}</Text><Text className="mt-1 text-sm text-ink">{gym.address}</Text>
        <Text className="my-3 text-3xl font-bold text-ink">{estimate.score === null ? 'No estimate' : `${Math.round(estimate.score)} / 100`}</Text>
        <Text className="mb-3 text-ink">{estimate.detail}</Text>
        <Text className="mb-2 font-semibold text-ink">Is it busy right now?</Text><View className="flex-row flex-wrap">{(['Quiet', 'Normal', 'Packed'] as const).map(status => <Choice key={status} label={status} selected={vote.isSuccess && vote.variables?.slug === gym.slug && vote.variables.status === status} onPress={() => { if (!vote.isPending) vote.mutate({ slug: gym.slug, status }); }} />)}</View>
      </View>;
    })}
    {forecast.isError && <Text className="mb-3 text-ink">The community forecast is unavailable. Check your connection and refresh.</Text>}
    {crowd.isError && <Text className="mb-3 text-ink">Student reports are unavailable. Check your connection and refresh.</Text>}
    {(vote.error || notice) && <Text accessibilityRole={vote.error ? 'alert' : undefined} className="mb-4 text-ink">{vote.error?.message ?? notice}</Text>}
    <Action secondary label="Refresh gym status" onPress={() => { void baseline.refetch(); void crowd.refetch(); void forecast.refetch(); }} />
    {profile?.is_advanced_track && <View className="my-5 rounded-2xl bg-surface p-5"><Text className="mb-3 text-xl font-bold text-ink">Your Upper / Lower week</Text>{[...profile.training_days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((day, i) => <Text key={day} className="mb-2 text-ink">{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]} · {DEFAULT_UPPER_LOWER[i]?.name}</Text>)}{profile.preworkout_fast_carbs && <Text className="mt-2 text-ink">{profile.preworkout_carbs_g} g fast-digesting carbohydrates allocated {profile.preworkout_minutes} min before training.</Text>}</View>}
    <Action secondary label="Sign out" onPress={() => { void signOutWithDeviceCleanup().then(({ error }) => { if (error) setNotice('Unable to sign out. Please try again.'); }).catch(() => setNotice('Unable to sign out. Please try again.')); }} />
  </ScrollView></SafeAreaView>;
}
