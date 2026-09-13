import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Choice } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { UNIT_SYSTEMS, readUnits, weightLabel, writeUnits, type UnitSystem } from './measurementUnits';

export function UnitsCard({ onChange }: { onChange?: (system: UnitSystem) => void }) {
  const [system, setSystem] = useState<UnitSystem>(() => readUnits());
  return <View>
    <Text className="mb-3">Everything is stored the same way either way — this changes what is shown and what a number you type means.</Text>
    <View className="mb-3 flex-row flex-wrap">{UNIT_SYSTEMS.map(([value, label]) => <Choice key={value} label={label}
      selected={system === value} onPress={() => { const next = writeUnits(value); setSystem(next); onChange?.(next); haptic('selection'); }} />)}</View>
    <Text className="text-sm">A 180 lb weigh-in reads as {weightLabel(180, system)}.</Text>
  </View>;
}
