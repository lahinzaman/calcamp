import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { Reveal } from '../../theme/motion';
import { haptic } from '../../theme/haptics';
import { useAuthStore } from '../../store/authStore';
import { exerciseById } from './catalog';
import { MUSCLE_LABELS } from './volume';
import { VolumeTrend } from './VolumeTrend';
import type { LiftHistory, SessionVolumePoint } from './history';
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const pad = (value: number) => String(value).padStart(2, '0');
const keyFor = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
const leadingBlanks = (year: number, month: number) => (new Date(year, month, 1).getDay() + 6) % 7;
const dayLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
type Tab = 'calendar' | 'records';
export default function WorkoutHistoryScreen() {
  const owner = useAuthStore(s => s.session?.user.id);
  const [lifts, setLifts] = useState<LiftHistory>({});
  const [volumeLog, setVolumeLog] = useState<SessionVolumePoint[]>([]);
  const [tab, setTab] = useState<Tab>('calendar');
  const [cursor, setCursor] = useState(() => { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() }; });
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!owner) return;
      const { syncEngine } = await import('../sync/runtime');
      if (!active || syncEngine.owner !== owner) return;
      setLifts(syncEngine.data.lifts ?? {}); setVolumeLog(syncEngine.data.volumeLog ?? []);
    })();
    return () => { active = false; };
  }, [owner]);
  const byDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const point of volumeLog) map.set(point.date, (map.get(point.date) ?? 0) + point.value);
    return map;
  }, [volumeLog]);
  const records = useMemo(() => Object.values(lifts)
    .map(record => ({ ...record, name: exerciseById(record.exerciseId)?.name ?? 'Exercise', muscle: MUSCLE_LABELS[exerciseById(record.exerciseId)?.primaryMuscle ?? ''] ?? '' }))
    .sort((a, b) => b.lastPerformedMs - a.lastPerformedMs), [lifts]);
  const days = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const move = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() }); haptic('selection');
  };
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const trained = [...byDate.keys()].filter(date => date.startsWith(`${cursor.year}-${pad(cursor.month + 1)}`)).length;
  return <SafeAreaView edges={['left','right']} className="flex-1 bg-background">
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <Reveal index={0}>
        <View className="mb-4 flex-row flex-wrap">
          {([['calendar', 'Calendar'], ['records', 'Personal records']] as const).map(([value, label]) =>
            <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} accessibilityLabel={label}
              onPress={() => { setTab(value); haptic('selection'); }} weight="firm"
              className={`mb-2 mr-2 rounded-full px-5 py-3 ${tab === value ? 'bg-accent' : 'bg-surface'}`}>
              <Text className="font-bold">{label}</Text></Pressable>)}
        </View>
      </Reveal>

      {tab === 'calendar' && <>
        <Reveal index={1}>
          <View className="mb-3 flex-row items-center justify-between">
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" weight="subtle" onPress={() => move(-1)}
              className="h-12 w-12 items-center justify-center rounded-full bg-surface"><Text className="text-xl font-bold">‹</Text></Pressable>
            <View className="items-center"><Text className="text-xl font-bold">{monthLabel}</Text><Text className="text-sm">{trained} session{trained === 1 ? '' : 's'}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" weight="subtle" onPress={() => move(1)}
              className="h-12 w-12 items-center justify-center rounded-full bg-surface"><Text className="text-xl font-bold">›</Text></Pressable>
          </View>
          <View className="flex-row">{WEEK.map((day, index) => <View key={index} style={{ flex: 1 }} className="items-center pb-2"><Text className="text-xs">{day}</Text></View>)}</View>
          <View className="flex-row flex-wrap">
            {Array.from({ length: leadingBlanks(cursor.year, cursor.month) }, (_, i) => <View key={`blank-${i}`} style={{ width: `${100 / 7}%` }} className="p-1" />)}
            {Array.from({ length: days }, (_, i) => {
              const date = keyFor(cursor.year, cursor.month, i + 1);
              const volume = byDate.get(date);
              return <View key={date} style={{ width: `${100 / 7}%` }} className="p-1">
                <View accessibilityLabel={volume ? `${date}, ${Math.round(volume)} lbs moved` : `${date}, rest day`}
                  className={`items-center rounded-xl py-2 ${volume ? 'bg-accent' : 'bg-raised'}`}>
                  <Text className={volume ? 'font-bold' : ''}>{i + 1}</Text>
                  <Text className="text-[10px]" style={{ opacity: volume ? 1 : .3 }}>{volume ? '●' : '·'}</Text>
                </View>
              </View>;
            })}
          </View>
        </Reveal>
        <Reveal index={2}><VolumeTrend log={volumeLog} /></Reveal>
      </>}

      {tab === 'records' && <Reveal index={1}>
        {!records.length && <View className="rounded-3xl border border-border bg-surface p-6">
          <Text className="text-xl font-bold">No lifts logged yet</Text>
          <Text className="mt-2">Finish a session and your bests, previous reps and estimated one-rep maxes appear here.</Text>
        </View>}
        {records.map(record => <View key={record.exerciseId} className="mb-3 rounded-3xl border border-border bg-surface p-5">
          <View className="mb-2 flex-row items-baseline justify-between gap-3">
            <Text className="flex-1 font-bold" numberOfLines={1}>{record.name}</Text>
            <Text className="text-sm">{record.sessions} session{record.sessions === 1 ? '' : 's'}</Text>
          </View>
          <Text className="mb-3 text-sm">{record.muscle} · last trained {dayLabel(new Date(record.lastPerformedMs).toISOString().slice(0, 10))}</Text>
          <View className="flex-row flex-wrap gap-5">
            <View><Text className="text-2xl font-bold">{Math.round(record.bestWeightLbs)}</Text><Text className="text-xs">Heaviest lbs</Text></View>
            <View><Text className="text-2xl font-bold">{Math.round(record.bestOneRepMaxLbs)}</Text><Text className="text-xs">Est. 1RM lbs</Text></View>
            <View><Text className="text-2xl font-bold">{Math.round(record.bestSessionVolumeLbs).toLocaleString()}</Text><Text className="text-xs">Best session volume</Text></View>
          </View>
          {!!record.lastSets.length && <Text className="mt-3 text-sm">Last time: {record.lastSets.map(set => `${set.weightLbs}×${set.reps}`).join(' · ')}</Text>}
        </View>)}
      </Reveal>}
    </ScrollView>
  </SafeAreaView>;
}
