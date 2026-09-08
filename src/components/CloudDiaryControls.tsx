import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { nutritionStore } from '../store/nutritionStore';
import { useSyncStatus } from '../store/syncStore';
import { SyncIndicator } from './SyncIndicator';
export function CloudDiaryControls() {
  const s = useSyncStatus(); const [review, setReview] = useState(false);
  const [jobs, setJobs] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inspect = async () => {
    const { syncEngine } = await import('../modules/sync/runtime');
    setJobs(syncEngine.data.queue.filter(q => q.blocked).map(q => ({ id: q.id, label: q.kind === 'nutrition' ? `Diary edit · ${q.data.date}` : q.kind === 'workout' ? q.data.session.name : 'Health export' })));
    setReview(true);
  };
  return <View className="mb-5 rounded-2xl bg-white p-4"><SyncIndicator />
    <View className="flex-row gap-3">
      <Pressable accessibilityRole="button" disabled={s.syncing} onPress={() => void nutritionStore.getState().loadToday()} className="flex-1 rounded-xl bg-zinc-100 p-3"><Text className="text-center text-sm font-semibold">Refresh diary</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={s.syncing} onPress={() => void nutritionStore.getState().saveToday()} className="flex-1 rounded-xl bg-zinc-950 p-3"><Text className="text-center text-sm font-semibold text-white">{s.syncing ? 'Syncing…' : 'Sync now'}</Text></Pressable>
    </View>
    {!!s.blocked && <Pressable accessibilityRole="button" onPress={() => void inspect()} className="mt-3 p-2"><Text className="text-center font-semibold text-amber-800">Review queued edits</Text></Pressable>}
    <Modal visible={review} transparent animationType="fade" onRequestClose={() => setReview(false)}><View className="flex-1 justify-center bg-black/40 p-6"><View className="rounded-2xl bg-white p-5">
      <Text className="mb-3 text-xl font-bold">Review sync conflicts</Text><Text className="mb-4 text-zinc-600">These edits could not be applied. Retry after reconnecting or correcting the server record. Discard only an edit you no longer want; your other queued edits remain.</Text>
      {jobs.map(job => <View key={job.id} className="mb-3"><Text>{job.label}</Text><Pressable accessibilityRole="button" onPress={() => { void (async () => {
        try { const { discardBlockedEdit } = await import('../modules/sync/runtime'); await discardBlockedEdit(job.id); setJobs(current => current.filter(j => j.id !== job.id));
        } catch { setError('Unable to discard. Your queued edit remains saved; reconnect and try again.'); }
      })(); }}><Text className="mt-2 font-semibold text-red-700">Discard this queued edit</Text></Pressable></View>)}
      {error && <Text className="text-red-700">{error}</Text>}
      <Pressable accessibilityRole="button" className="mt-4 p-3" onPress={() => { void import('../modules/sync/runtime').then(({ syncEngine }) => syncEngine.retryBlocked()).catch(() => setError('Device storage is unavailable. Your edits remain saved.')); setReview(false); }}><Text className="font-semibold">Retry queued edits</Text></Pressable>
      <Pressable accessibilityRole="button" className="p-3" onPress={() => setReview(false)}><Text>Keep edits and close</Text></Pressable>
    </View></View></Modal>
  </View>;
}
