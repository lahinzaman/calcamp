import { useState } from 'react';
import { Modal, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { randomUUID } from 'expo-crypto';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Action, Field } from '../../components/FormControls';
import { Pressable } from '../../theme/Pressable';
import { EXERCISE_CATALOG } from './catalog';
import { ExerciseHelp } from './ExerciseHelp';
import { validateRoutine, type WorkoutRoutine } from './routines';
export function RoutineBuilder({ onClose, onSave }: {onClose:()=>void; onSave:(routine:WorkoutRoutine)=>Promise<void>}) {
  const [name,setName] = useState(''); const [search,setSearch] = useState(''); const [ids,setIds] = useState<string[]>([]);
  const [error,setError] = useState<string|null>(null); const [busy,setBusy] = useState(false);
  const [id] = useState(randomUUID);
  const selected = ids.map(id => EXERCISE_CATALOG.find(e=>e.id===id)!);
  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}><SafeAreaView className="flex-1 bg-background">
    <FlashList data={EXERCISE_CATALOG.filter(e => `${e.name} ${e.primaryMuscle} ${e.equipment}`.toLowerCase().includes(search.toLowerCase()))} keyExtractor={e=>e.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:60}}
      ListHeaderComponent={<><Text className="mb-4 text-3xl font-bold">Create a routine</Text><Field label="Routine name" value={name} onChangeText={setName} maxLength={80} /><Text className="mb-3">Tap exercises in your preferred order. Tap a selected exercise to remove it.</Text>{selected.map((e,i)=><Text key={e.id} className="mb-1">{i+1}. {e.name}</Text>)}<View className="mt-4"><Field label="Search 101 exercises" value={search} onChangeText={setSearch} /></View><Action label={busy ? 'Saving…' : `Save routine · ${ids.length} exercises`} disabled={busy} onPress={()=>{if(busy)return;setError(null);void (async()=>{try{const routine={id,name:name.trim(),exerciseIds:ids};validateRoutine(routine);setBusy(true);await onSave(routine);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}})();}} /><Action secondary label="Cancel routine" onPress={onClose} />{error&&<Text accessibilityRole="alert">{error}</Text>}</>}
      renderItem={({item:e})=><View className="mb-2 flex-row items-center gap-2"><Pressable accessibilityRole="checkbox" accessibilityState={{checked:ids.includes(e.id)}} onPress={()=>setIds(current=>current.includes(e.id)?current.filter(id=>id!==e.id):current.length<30?[...current,e.id]:current)} className="flex-1 rounded-xl bg-surface p-4"><Text className="font-bold">{ids.includes(e.id)?'✓ ':''}{e.name}</Text><Text className="text-sm">{e.primaryMuscle} · {e.equipment}</Text></Pressable><ExerciseHelp exercise={e} /></View>} />
  </SafeAreaView></Modal>;
}
