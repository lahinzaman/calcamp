import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text, TextInput } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { safelyEdit } from '../../components/safelyEdit';
import { MAX_EXERCISE_NOTE, workoutStore } from '../../store/workoutStore';
import type { SessionExercise } from '../../types/workout';

/**
 * The seat height, the bar you used, the side that lagged — the things you would otherwise
 * try to remember for a week. Collapsed to a single line until there is something to read,
 * so it does not sit between you and the set you are about to log.
 *
 * Writing commits on blur rather than per keystroke: every store write goes through the sync
 * bridge to disk, and a note is a sentence, not a number being typed into a set.
 */
export function ExerciseNote({ entry }: { entry: SessionExercise }) {
  const [open, setOpen] = useState(!!entry.note);
  const [draft, setDraft] = useState(entry.note ?? '');
  // A different exercise is a different note; a replaced one has had its note dropped.
  useEffect(() => { setDraft(entry.note ?? ''); setOpen(!!entry.note); }, [entry.id, entry.note]);
  const commit = () => { if (draft.trim() !== (entry.note ?? '')) safelyEdit(() => workoutStore.getState().setExerciseNote(entry.id, draft)); };

  if (!open) return <Pressable accessibilityRole="button" accessibilityLabel={`Add a note for ${entry.exercise.name}`}
    onPress={() => setOpen(true)} weight="subtle" className="mx-4 mt-3 min-h-11 justify-center rounded-xl bg-raised px-4">
    <Text className="text-sm font-semibold">＋ Add a note</Text></Pressable>;

  return <View className="mx-4 mt-3">
    <TextInput accessibilityLabel={`Note for ${entry.exercise.name}`} value={draft} onChangeText={setDraft}
      onBlur={commit} onEndEditing={commit} multiline maxLength={MAX_EXERCISE_NOTE}
      placeholder="Seat 4, pin 7, left side lagging…" blurOnSubmit
      className="min-h-12 rounded-xl border border-border bg-background px-3 py-2 text-sm text-ink" />
    <Text className="mt-1 text-xs">Saved with this session · {draft.trim().length}/{MAX_EXERCISE_NOTE}</Text>
  </View>;
}
