import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInRight, FadeOutLeft, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Action, Field, NumericField } from '../../components/FormControls';
import { ProgressBar, TIMING } from '../../theme/motion';
import { haptic } from '../../theme/haptics';
import { useOnboardingStore } from '../../store/onboardingStore';
import { authStore, useAuthStore } from '../../store/authStore';
import { heightInches } from '../../lib/units';
import { answered, visibleQuestions, type QuizQuestion, type Draft } from './questions';
const WEEKDAYS = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]] as const;

function OptionCard({ option, selected, onPress }: { option: NonNullable<QuizQuestion['options']>[number]; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={option.label}
    onPress={() => { onPress(); haptic('selection'); }} weight="firm"
    className={`mb-3 rounded-2xl border p-5 ${selected ? 'border-accent bg-raised' : 'border-border bg-surface'}`}>
    <View className="flex-row items-start gap-3">
      <Text className="text-lg font-bold" style={{ opacity: selected ? 1 : .35 }}>{selected ? '●' : '○'}</Text>
      <View className="flex-1">
        <Text className="text-lg font-bold">{option.label}</Text>
        {option.description && <Text className="mt-1 text-sm">{option.description}</Text>}
      </View>
    </View>
  </Pressable>;
}

function Body({ question, draft, patch }: { question: QuizQuestion; draft: Draft; patch: (value: Partial<Draft>) => void }) {
  const current = question.read(draft);
  const [feet, setFeet] = useState<number | null>(draft.height_inches ? Math.floor(draft.height_inches / 12) : null);
  const [inches, setInches] = useState<number | null>(draft.height_inches ? Math.round(draft.height_inches % 12) : 0);
  if (question.kind === 'choice') {
    return <>{question.options!.map(option => <OptionCard key={String(option.value)} option={option}
      selected={current === option.value} onPress={() => patch(question.write(draft, option.value as never))} />)}</>;
  }
  if (question.kind === 'number') {
    return <NumericField label={question.unit ? `Amount · ${question.unit}` : 'Amount'} keyboardType="decimal-pad"
      value={current as number | null} onValue={value => patch(question.write(draft, value as never))} />;
  }
  if (question.kind === 'text') {
    return <Field label={question.prompt} value={(current as string) ?? ''} placeholder={question.placeholder}
      autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation"
      onChangeText={(value: string) => patch(question.write(draft, value as never))} />;
  }
  if (question.kind === 'height') {
    const apply = (nextFeet: number | null, nextInches: number | null) => {
      if (nextFeet === null || nextInches === null) return;
      try { patch(question.write(draft, { feet: nextFeet, inches: nextInches } as never)); } catch { /* shown by the question's own problem text */ }
    };
    return <View className="flex-row gap-4">
      <View className="flex-1"><NumericField label="Feet" keyboardType="number-pad" value={feet} onValue={value => { setFeet(value); apply(value, inches); }} /></View>
      <View className="flex-1"><NumericField label="Inches" keyboardType="decimal-pad" value={inches} onValue={value => { setInches(value); apply(feet, value); }} /></View>
    </View>;
  }
  const days = current as number[];
  return <View className="flex-row flex-wrap gap-2">{WEEKDAYS.map(([label, day]) => {
    const selected = days.includes(day);
    return <Pressable key={day} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={label}
      onPress={() => { patch(question.write(draft, (selected ? days.filter(d => d !== day) : [...days, day]) as never)); haptic('selection'); }}
      weight="firm" className={`min-w-[72px] items-center rounded-2xl border px-4 py-4 ${selected ? 'border-accent bg-raised' : 'border-border bg-surface'}`}>
      <Text className="font-bold">{label}</Text>
    </Pressable>;
  })}</View>;
}

export default function QuizScreen() {
  const { draft, patch } = useOnboardingStore();
  const pendingEmail = useAuthStore(s => s.pendingSignupEmail);
  const session = useAuthStore(s => s.session);
  const [index, setIndex] = useState(0);
  const [showProblem, setShowProblem] = useState(false);
  const visible = useMemo(() => visibleQuestions(draft), [draft]);
  const position = Math.min(index, visible.length - 1);
  const question = visible[position];
  const problem = question.problem?.(draft) ?? null;
  const ready = answered(question, draft);
  const advance = () => {
    if (!ready) { setShowProblem(true); haptic('warning'); return; }
    setShowProblem(false);
    if (position + 1 < visible.length) { setIndex(position + 1); haptic('light'); }
    else router.push('/onboarding/review');
  };
  const back = () => {
    setShowProblem(false);
    if (position === 0) router.back(); else setIndex(position - 1);
  };
  return <SafeAreaView edges={['left','right','bottom']} className="flex-1 bg-background">
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View className="px-6 pb-2 pt-4" style={{ maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        <View className="mb-2 flex-row items-baseline justify-between">
          <Text className="text-sm font-bold tracking-widest">QUESTION {position + 1} OF {visible.length}</Text>
          <Text className="text-sm">{Math.round((position / visible.length) * 100)}%</Text>
        </View>
        <ProgressBar value={position} target={visible.length} tone="protein" height={6} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        <Animated.View key={question.id} entering={FadeInRight.duration(TIMING.base).reduceMotion(ReduceMotion.System)}
          exiting={FadeOutLeft.duration(TIMING.fast).reduceMotion(ReduceMotion.System)}>
          <Text className="text-3xl font-bold leading-tight">{question.prompt}</Text>
          {question.helper && <Text className="mb-6 mt-3">{question.helper}</Text>}
          {!question.helper && <View className="mb-6" />}
          <Body question={question} draft={draft} patch={patch} />
          {showProblem && problem && <Text accessibilityRole="alert" className="mt-2 rounded-xl bg-raised p-4">{problem}</Text>}
          {!!pendingEmail && !session && position === 0 && <View className="mt-6 rounded-2xl bg-raised p-4">
            <Text className="text-sm">Confirm {pendingEmail}, then sign in to save. You can answer these now.</Text>
            <Action secondary label="Return to sign in" onPress={() => { authStore.getState().setPendingSignup(null); router.replace('/auth'); }} />
          </View>}
        </Animated.View>
      </ScrollView>
      <View className="px-6 pb-4" style={{ maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        <Action label={position + 1 < visible.length ? 'Continue' : 'See my plan'} onPress={advance} tone={ready ? 'success' : 'none'} />
        <Action secondary label={position === 0 ? 'Back' : 'Previous question'} onPress={back} />
        {question.optional && !ready && <Text className="mt-1 text-center text-sm">This one is optional.</Text>}
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
