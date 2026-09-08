import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View className="mb-4 gap-2"><Text className="text-sm font-semibold text-zinc-700">{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#71717a" {...props} className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950" /></View>;
}
export function Action({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} className={`mb-3 rounded-xl px-4 py-3 ${disabled ? 'bg-zinc-300' : secondary ? 'bg-zinc-200' : 'bg-red-700'}`}><Text className={`text-center font-semibold ${secondary ? 'text-zinc-900' : 'text-white'}`}>{label}</Text></Pressable>;
}
export function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} className={`mb-2 mr-2 rounded-xl border px-4 py-3 ${selected ? 'border-red-700 bg-red-50' : 'border-zinc-300 bg-white'}`}><Text className={selected ? 'font-semibold text-red-800' : 'text-zinc-700'}>{label}</Text></Pressable>;
}

/** Keep the edit string so decimal points and temporarily blank numbers remain editable. */
export function NumericField({ value, onValue, ...props }: Omit<TextInputProps, 'value' | 'onChangeText'> & { label: string; value: number | null; onValue: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  return <Field {...props} value={text} onChangeText={next => { setText(next); onValue(next.trim() ? Number(next) : null); }} />;
}
