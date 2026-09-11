import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../theme/primitives';
import { Pop, Reveal } from '../../theme/motion';
import { haptic } from '../../theme/haptics';
import { useAuthStore } from '../../store/authStore';
import { useNutritionStore, localDateKey } from '../../store/nutritionStore';
import { loadHistory, shiftDate } from '../../api/history';
import { hitTargets, milestones, summarizeStreak } from './streaks';
export function StreakCard() {
  const owner = useAuthStore(s => s.session?.user.id);
  const consumed = useNutritionStore(s => s.consumedMacros);
  const targets = useNutritionStore(s => s.dailyTargets?.macros);
  const today = localDateKey(new Date());
  const history = useQuery({ enabled: !!owner, queryKey: ['history', owner, 60, today], queryFn: () => loadHistory(owner!, shiftDate(today, -59), today), staleTime: 300000 });
  const streak = summarizeStreak(history.data ?? [], today);
  const hit = hitTargets(consumed, targets);
  const celebrated = useRef(false);
  const [justHit, setJustHit] = useState(false);
  useEffect(() => {
    if (hit && !celebrated.current) { celebrated.current = true; setJustHit(true); haptic('success'); }
    if (!hit) { celebrated.current = false; setJustHit(false); }
  }, [hit]);
  const next = milestones(streak, 0).find(milestone => !milestone.reached);
  return <Reveal index={1}><View className="mb-5 rounded-3xl border border-border bg-surface p-5">
    <View className="flex-row items-center gap-5">
      <Pop trigger={streak.current}><View className="items-center"><Text className="text-4xl font-bold">{streak.current}</Text><Text className="text-xs">DAY STREAK</Text></View></Pop>
      <View className="flex-1">
        {justHit ? <><Text className="font-bold">🎯 Targets hit for today</Text><Text className="mt-1 text-sm">Calories and protein both landed. That is the day done.</Text></>
          : streak.current ? <><Text className="font-bold">{streak.current === streak.longest && streak.current > 1 ? 'Your best run yet' : `Longest ${streak.longest} days`}</Text>
            <Text className="mt-1 text-sm">{next ? `Next up: ${next.label} — ${next.description}` : 'Every milestone reached. Remarkable.'}</Text></>
          : <><Text className="font-bold">Start a streak today</Text><Text className="mt-1 text-sm">Log anything at all and the counter starts. {streak.loggedDays ? `You have ${streak.loggedDays} days logged in total.` : ''}</Text></>}
      </View>
    </View>
  </View></Reveal>;
}
