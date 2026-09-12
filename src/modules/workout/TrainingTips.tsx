import { useMemo } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../theme/primitives';
import { Reveal } from '../../theme/motion';
import { useAuthStore } from '../../store/authStore';
import { localDateKey } from '../../store/nutritionStore';
import { loadHistory, shiftDate } from '../../api/history';
import { intendedWeeklyChange } from '../onboarding/budget';
import { coachingTips } from './coaching';
import { routineExercises } from './routines';
import { weeklyVolume, type ExperienceLevel } from './volume';
import type { WorkoutRoutine } from './routines';
import type { LiftHistory, SessionVolumePoint } from './history';
const DAY = 86_400_000;
export function TrainingTips({ routines, experience, lifts, volumeLog, index = 3 }: {
  routines: WorkoutRoutine[]; experience: ExperienceLevel; lifts: LiftHistory; volumeLog: SessionVolumePoint[]; index?: number;
}) {
  const owner = useAuthStore(s => s.session?.user.id);
  const profile = useAuthStore(s => s.profile);
  const today = localDateKey(new Date());
  const history = useQuery({ enabled: !!owner, queryKey: ['history', owner, 60, today],
    queryFn: () => loadHistory(owner!, shiftDate(today, -59), today), staleTime: 300000 });
  const tips = useMemo(() => {
    const schedule = routines.map(routine => ({ exercises: routineExercises(routine), timesPerWeek: routine.timesPerWeek ?? 1 }));
    const rests = schedule.flatMap(entry => entry.exercises.map(exercise => exercise.restSeconds));
    const days = history.data ?? [];
    const weighIns = days.filter(day => day.body_weight_lbs !== null);
    const withProtein = days.filter(day => day.proteinG !== null).slice(-7);
    const weight = weighIns.at(-1)?.body_weight_lbs ?? profile?.weight_lbs ?? null;
    const cutoff = Date.now() - 7 * DAY;
    // Sessions since the most recent personal best, as a stand-in for stalled progression.
    const lastPr = Math.max(0, ...Object.values(lifts).map(record => record.lastPerformedMs));
    const sessionsSincePr = lastPr ? volumeLog.filter(point => Date.parse(`${point.date}T00:00:00`) > lastPr).length : 0;
    return coachingTips({
      experience,
      volume: weeklyVolume(schedule, experience),
      sessionsThisWeek: volumeLog.filter(point => Date.parse(`${point.date}T00:00:00`) >= cutoff).length,
      stalledSessions: sessionsSincePr,
      averageRpe: null,
      proteinPerLb: withProtein.length && weight ? withProtein.reduce((sum, day) => sum + day.proteinG!, 0) / withProtein.length / weight : null,
      intendedWeeklyChangeLbs: intendedWeeklyChange(profile?.lifestyle_survey),
      daysSinceWeighIn: weighIns.length ? Math.floor((Date.parse(`${today}T00:00:00`) - Date.parse(`${weighIns.at(-1)!.log_date}T00:00:00`)) / DAY) : null,
      shortestRestSeconds: rests.length ? Math.min(...rests) : null,
    });
  }, [routines, experience, lifts, volumeLog, history.data, profile, today]);
  if (!tips.length) return null;
  return <Reveal index={index}><View className="my-4 rounded-3xl border border-border bg-surface p-5">
    <Text className="mb-1 text-sm font-bold tracking-widest">COACHING</Text>
    <Text className="mb-3 text-sm">Based on what you have actually logged.</Text>
    {tips.slice(0, 3).map(tip => <View key={tip.id} className="mb-3">
      <Text className="font-bold">{tip.title}</Text>
      <Text className="mt-1 text-sm">{tip.body}</Text>
    </View>)}
  </View></Reveal>;
}
