import { useState } from 'react';
import { Modal, View } from 'react-native';
import { Text } from '../../theme/primitives';
import { SafeAreaView } from '../../theme/SafeArea';
import { Action } from '../../components/FormControls';
import { ExercisePicker } from './ExercisePicker';
import { exerciseById, type CatalogExercise } from './catalog';

/**
 * The picker, as a one-at-a-time sheet. Building a routine chooses many exercises at once;
 * during a session you are answering a single question — what am I doing instead, or what am I
 * adding — so tapping a second row moves the choice rather than collecting both.
 */
export function ExercisePickerSheet({ title, subtitle, confirmLabel, warning, onChoose, onClose }: {
  title: string;
  subtitle: string;
  confirmLabel: (exercise: CatalogExercise) => string;
  /** Shown above the list when the choice costs something, such as clearing logged sets. */
  warning?: string;
  onChoose: (exercise: CatalogExercise) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = picked ? exerciseById(picked) : undefined;
  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-5 pt-4">
        <Text className="text-2xl font-bold">{title}</Text>
        <Text className="mt-1 text-sm">{subtitle}</Text>
        {warning && <Text accessibilityRole="alert" className="mt-3 rounded-2xl bg-raised p-3 text-sm">{warning}</Text>}
      </View>
      <ExercisePicker selectedIds={picked ? [picked] : []}
        onToggle={id => setPicked(current => current === id ? null : id)} onClose={onClose}
        footer={<>
          <Action label={chosen ? confirmLabel(chosen) : 'Pick an exercise'} disabled={!chosen}
            tone={chosen ? 'success' : 'none'} onPress={() => { if (chosen) { onChoose(chosen); onClose(); } }} />
          <Action secondary label="Cancel" onPress={onClose} />
        </>} />
    </SafeAreaView>
  </Modal>;
}
