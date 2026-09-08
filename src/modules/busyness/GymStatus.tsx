import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { fetchGymBaselines, fetchGymSummary, submitGymVote } from '../../api/campus';
import { GYMS, type CrowdStatus, type GymSlug } from '../../types/facilities';
import { useAuthStore } from '../../store/authStore';
import { Action, Choice } from '../../components/FormControls';
import { getSupabase } from '../../api/supabase';
import { DEFAULT_UPPER_LOWER } from '../../types/profile';
export default function GymStatus() {
  const user = useAuthStore(s => s.session?.user.id); const profile = useAuthStore(s => s.profile);
  const [notice, setNotice] = useState<string | null>(null);
  const cache = useQueryClient();
  const baseline = useQuery({ queryKey: ['gym-baselines', user], queryFn: ({ signal }) => fetchGymBaselines(signal), enabled: !!user, staleTime: 60_000, refetchInterval: 60_000 });
  const crowd = useQuery({ queryKey: ['gym-crowd', user], queryFn: ({ signal }) => fetchGymSummary(signal), enabled: !!user, staleTime: 0, refetchInterval: 30_000 });
  const vote = useMutation({ mutationFn: ({ slug, status }: { slug: GymSlug; status: CrowdStatus }) => submitGymVote(slug, status),
    onSuccess: () => { setNotice('Your report is included for the next 30 minutes.'); void cache.invalidateQueries({ queryKey: ['gym-crowd', user] }); } });
  return <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-zinc-50"><ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 50, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
    <Text className="text-sm font-bold uppercase tracking-widest text-red-700">Rutgers recreation</Text><Text className="mb-3 mt-2 text-3xl font-bold text-zinc-950">Find your space</Text>
    <Text className="mb-6 text-zinc-600">BestTime estimates visits relative to a venue's weekly peak. Recent student reports take priority. Neither measures physical capacity or confirms opening hours.</Text>
    {GYMS.map(gym => {
      const history = baseline.data?.find(b => b.slug === gym.slug);
      const report = crowd.data?.find(c => c.location_slug === gym.slug);
      const recent = !!report?.latest_vote_at && Date.now() - Date.parse(report.latest_vote_at) < 30 * 60_000 && !crowd.isError;
      const override = recent && !!report && report.vote_count > 0 && report.crowd_score !== null;
      const score = override ? Number(report.crowd_score) : history?.baseline ?? null;
      return <View key={gym.slug} className="mb-5 rounded-3xl border border-zinc-200 bg-white p-5">
        <Text className="text-xl font-bold text-zinc-900">{gym.name}</Text><Text className="mt-1 text-sm text-zinc-500">{gym.address}</Text>
        <Text className="my-3 text-3xl font-bold text-red-700">{score === null ? 'No estimate' : `${Math.round(score)} / 100`}</Text>
        <Text className="mb-3 text-zinc-600">{override ? `${report.vote_count} student report${report.vote_count === 1 ? '' : 's'} · ${score! < 25 ? 'Quiet' : score! < 75 ? 'Normal' : 'Packed'}` : 'BestTime historical busyness'}</Text>
        <Text className="mb-2 font-semibold text-zinc-800">Is it busy right now?</Text><View className="flex-row flex-wrap">{(['Quiet', 'Normal', 'Packed'] as const).map(status => <Choice key={status} label={status} selected={vote.isSuccess && vote.variables?.slug === gym.slug && vote.variables.status === status} onPress={() => { if (!vote.isPending) vote.mutate({ slug: gym.slug, status }); }} />)}</View>
      </View>;
    })}
    {baseline.isPending && <Text className="mb-3 text-zinc-600">Loading forecasts…</Text>}
    {baseline.isError && <Text className="mb-3 text-red-700">Forecasts are unavailable; student reports can still be used.</Text>}
    {crowd.isError && <Text className="mb-3 text-red-700">Student reports could not be loaded. Check the Phase 4 database migration.</Text>}
    {(vote.error || notice) && <Text accessibilityRole={vote.error ? 'alert' : undefined} className="mb-4 text-zinc-700">{vote.error?.message ?? notice}</Text>}
    <Action secondary label="Refresh gym status" onPress={() => { void baseline.refetch(); void crowd.refetch(); }} />
    {profile?.is_advanced_track && <View className="my-5 rounded-2xl bg-white p-5"><Text className="mb-3 text-xl font-bold text-zinc-900">Your Upper / Lower week</Text>{[...profile.training_days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((day, i) => <Text key={day} className="mb-2 text-zinc-700">{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]} · {DEFAULT_UPPER_LOWER[i]?.name}</Text>)}{profile.preworkout_fast_carbs && <Text className="mt-2 text-zinc-600">{profile.preworkout_carbs_g} g fast-digesting carbohydrates allocated {profile.preworkout_minutes} min before training.</Text>}</View>}
    <Action secondary label="Sign out" onPress={() => { void getSupabase().auth.signOut().then(({ error }) => { if (error) setNotice(error.message); }); }} />
  </ScrollView></SafeAreaView>;
}
