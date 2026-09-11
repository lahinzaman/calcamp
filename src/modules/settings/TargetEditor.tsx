import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Action, Field } from '../../components/FormControls';
import { authStore, useAuthStore } from '../../store/authStore';
import { nutritionStore } from '../../store/nutritionStore';
import { updateTargets } from '../../api/profile';
import { haptic } from '../../theme/haptics';
import type { MacroTotals } from '../../types/nutrition';
const FIELDS = [['caloriesKcal', 'Calories · kcal'], ['proteinG', 'Protein · g'], ['carbsG', 'Carbs · g'], ['fatG', 'Fats · g']] as const;
const blank: MacroTotals = { caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
const toText = (macros: MacroTotals | null) => Object.fromEntries(FIELDS.map(([key]) => [key, String(Math.round((macros ?? blank)[key]))])) as Record<keyof MacroTotals, string>;
function Group({ title, values, onChange }: { title: string; values: Record<keyof MacroTotals, string>; onChange: (key: keyof MacroTotals, value: string) => void }) {
  const energy = Number(values.proteinG) * 4 + Number(values.carbsG) * 4 + Number(values.fatG) * 9;
  const drift = Number.isFinite(energy) ? Math.round(energy - Number(values.caloriesKcal)) : 0;
  return <View className="mb-5 rounded-3xl bg-surface p-5">
    <Text className="mb-3 text-lg font-bold">{title}</Text>
    {FIELDS.map(([key, label]) => <Field key={key} label={label} value={values[key]} onChangeText={value => onChange(key, value)} keyboardType="decimal-pad" />)}
    {!!drift && <Text className="text-sm">Your macros come to {Math.round(energy)} kcal, {Math.abs(drift)} {drift > 0 ? 'above' : 'below'} the calorie target. You can save either way.</Text>}
  </View>;
}
export function TargetEditor({ onClose }: { onClose: () => void }) {
  const profile = useAuthStore(s => s.profile);
  const [rest, setRest] = useState(() => toText(profile?.rest_targets ?? null));
  const [training, setTraining] = useState(() => toText(profile?.training_targets ?? null));
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const advanced = !!profile?.is_advanced_track;
  const parse = (values: Record<keyof MacroTotals, string>) => Object.fromEntries(FIELDS.map(([key]) => [key, Number(values[key])])) as unknown as MacroTotals;
  const save = async () => {
    if (busy) return; setBusy(true); setError(null);
    try {
      const rest_targets = parse(rest);
      const next = await updateTargets({ rest_targets, training_targets: advanced ? parse(training) : null });
      authStore.getState().setProfile(next);
      nutritionStore.getState().setDailyTargets({ macros: rest_targets, micronutrients: {} });
      haptic('success'); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your targets could not be saved.'); haptic('error'); }
    finally { setBusy(false); }
  };
  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text className="text-sm font-bold tracking-widest">DAILY TARGETS</Text>
        <Text className="mb-2 mt-2 text-3xl font-bold">Adjust your budget</Text>
        <Text className="mb-5">Your onboarding estimate is a starting point. Change it whenever your goal or your body changes.</Text>
        <Group title={advanced ? 'Rest days' : 'Every day'} values={rest} onChange={(key, value) => setRest(current => ({ ...current, [key]: value }))} />
        {advanced && <Group title="Training days" values={training} onChange={(key, value) => setTraining(current => ({ ...current, [key]: value }))} />}
        {error && <Text accessibilityRole="alert" className="mb-4">{error}</Text>}
        <Action label={busy ? 'Saving…' : 'Save targets'} disabled={busy} onPress={() => void save()} tone="success" />
        <Action secondary label="Cancel" onPress={onClose} />
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
