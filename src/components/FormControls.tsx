import { useState } from 'react';
import { View, type TextInputProps } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { Text, TextInput } from '../theme/primitives';
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View className="mb-4 gap-2"><Text className="text-sm font-semibold text-ink">{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#71717a" {...props} className="rounded-xl border border-border bg-surface px-4 py-3 text-base text-ink" /></View>;
}
export function Action({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} className={`mb-3 min-h-12 justify-center rounded-xl px-4 py-3 ${disabled || secondary ? 'bg-raised' : 'bg-accent'}`}><Text className="text-center font-semibold">{label}</Text></Pressable>;
}
export function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} className={`mb-2 mr-2 min-h-12 justify-center rounded-xl border px-4 py-3 ${selected ? 'border-border bg-raised' : 'border-border bg-surface'}`}><Text className={selected ? 'font-semibold text-ink' : 'text-ink'}>{label}</Text></Pressable>;
}

/** Keep the edit string so decimal points and temporarily blank numbers remain editable. */
export function NumericField({ value, onValue, ...props }: Omit<TextInputProps, 'value' | 'onChangeText'> & { label: string; value: number | null; onValue: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  return <Field {...props} value={text} onChangeText={next => { setText(next); onValue(next.trim() ? Number(next) : null); }} />;
}
