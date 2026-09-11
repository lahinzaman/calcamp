import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Field } from '../../components/FormControls';
import { describePlates, loadPlates } from './plates';
export function PlateCalculator({ suggested }: { suggested?: number }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(suggested ? String(suggested) : '');
  const [bar, setBar] = useState('45');
  const plan = loadPlates(Number(target), Number(bar) || 0);
  return <View className="mx-4 mt-3">
    <Pressable accessibilityRole="button" accessibilityLabel="Plate calculator" accessibilityState={{ expanded: open }}
      weight="subtle" onPress={() => setOpen(value => !value)} className="flex-row items-center justify-between rounded-2xl bg-surface px-4 py-3">
      <Text className="font-bold">Plate calculator</Text><Text>{open ? '▴' : '▾'}</Text>
    </Pressable>
    {open && <View className="mt-2 rounded-2xl bg-surface p-4">
      <View className="flex-row gap-3">
        <View className="flex-1"><Field label="Target · lbs" value={target} onChangeText={setTarget} keyboardType="decimal-pad" /></View>
        <View className="flex-1"><Field label="Bar · lbs" value={bar} onChangeText={setBar} keyboardType="decimal-pad" /></View>
      </View>
      <Text className="text-lg font-bold">{describePlates(plan)}</Text>
      {!!plan && plan.remainder > 0 && <Text className="mt-1 text-sm">{plan.remainder} lbs short of your target — the rack cannot make it exactly.</Text>}
    </View>}
  </View>;
}
