import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../theme/primitives';
import * as Updates from 'expo-updates';
import { Action } from '../../components/FormControls';
import { useWorkoutStore, workoutStore } from '../../store/workoutStore';
import { useSyncStatus } from '../../store/syncStore';
import { UpdateController, type UpdateState } from './controller';
const messages: Record<UpdateState, string> = {
  idle: 'Updates download without interrupting your session.', checking: 'Checking for an update…', downloading: 'Downloading update…',
  ready: 'Update ready. Restart when you are finished. Saved offline edits remain on this device.', current: 'You are up to date.',
  unavailable: 'Update checks are available in an installed release build.', error: 'Update unavailable. Your current version still works. Try again when connected.',
};
export function UpdateControls() {
  const [state, setState] = useState<UpdateState>('idle'); const [controller] = useState(() => new UpdateController(Updates, setState));
  const active = useWorkoutStore(s => !!s.activeSession); const syncing = useSyncStatus(s => s.syncing);
  return <View className="my-4 rounded-2xl bg-surface p-4"><Text className="mb-3 font-bold">App updates</Text>
    <Text accessibilityLiveRegion="polite" className="mb-4 text-ink">{messages[state]}</Text>
    {state === 'ready' ? <><Action label="Restart to apply update" disabled={active || syncing} onPress={() => void controller.apply(() => !workoutStore.getState().activeSession && !useSyncStatus.getState().syncing)} />
      {(active || syncing) && <Text className="text-sm text-ink">Finish your workout and allow the current sync to complete before restarting.</Text>}</>
      : <Action secondary label="Check for Updates" disabled={state === 'checking' || state === 'downloading'} onPress={() => void controller.check()} />}
  </View>;
}
