import { AccountAccess } from '../account/AccountAccess';
import { MacroOverview } from '../../components/MacroOverview';
import { FoodDiary } from '../diary/FoodDiary';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';
import { Reveal } from '../../theme/motion';
import { Action } from '../../components/FormControls';
import { useNutritionStore } from '../../store/nutritionStore';
import { useWorkoutStore } from '../../store/workoutStore';
import { useAuthStore } from '../../store/authStore';
import { SyncIndicator } from '../../components/SyncIndicator';
import { DEFAULT_UPPER_LOWER } from '../../types/profile';
export default function DashboardScreen() {
  const date = useNutritionStore(s => s.date); const session = useWorkoutStore(s => s.activeSession);
  const profile = useAuthStore(s => s.profile);
  return <SafeAreaView edges={['top','left','right','bottom']} className="flex-1 bg-background"><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
    <Reveal index={0}><Text className="text-sm font-bold tracking-widest">CALCAMP</Text><Text className="mt-3 text-4xl leading-[52px] font-bold">Your daily picture.</Text><Text className="mt-1">{date} · Nutrition & training, together</Text></Reveal>
    <AccountAccess /><SyncIndicator /><MacroOverview /><FoodDiary />
    <Reveal index={1}><View className="mb-5 rounded-3xl bg-surface p-5"><Text className="text-xl font-bold">4-day Upper / Lower</Text><Text className="mb-4 mt-1">{session ? `In progress · ${session.name}` : 'A clear plan. One session at a time.'}</Text>
      <View className="flex-row flex-wrap gap-3">{DEFAULT_UPPER_LOWER.map((day,index) => {
        const days = profile?.is_advanced_track ? [...profile.training_days].sort((a,b) => (a || 7) - (b || 7)) : [];
        return <View key={day.name} className="rounded-2xl bg-raised p-3" style={{ flexBasis: 140, flexGrow: 1 }}><Text className="text-xs">{days[index] === undefined ? `SESSION ${index+1}` : ['SUN','MON','TUE','WED','THU','FRI','SAT'][days[index]]}</Text><Text className="mt-1 font-bold">{day.name}</Text><Text className="text-sm">{day.focus}</Text></View>;
      })}</View><View className="mt-4"><Action label={session ? 'Continue workout' : 'Open training log'} onPress={() => router.push('/explore')} /></View>
    </View></Reveal>
    <Reveal index={2}><Action label="🍽️ Explore dining & log a meal" onPress={() => router.push('/dining')} />
    <Action label="🚶 Plan a walk" secondary onPress={() => router.push('/walk')} /></Reveal>
  </ScrollView></SafeAreaView>;
}
