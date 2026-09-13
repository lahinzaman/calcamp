import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Choice } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { UNIT_SYSTEMS, readUnits, weightLabel, writeUnits, type UnitSystem } from './measurementUnits';
import { useT, type MessageKey } from '../../i18n';

export function UnitsCard({ onChange }: { onChange?: (system: UnitSystem) => void }) {
  const t = useT();
  const [system, setSystem] = useState<UnitSystem>(() => readUnits());
  return <View>
    <Text className="mb-3">{t('units.explainer')}</Text>
    <View className="mb-3 flex-row flex-wrap">{UNIT_SYSTEMS.map(([value]) => <Choice key={value} label={t(`units.${value}` as MessageKey)}
      selected={system === value} onPress={() => { const next = writeUnits(value); setSystem(next); onChange?.(next); haptic('selection'); }} />)}</View>
    <Text className="text-sm">A 180 lb weigh-in reads as {weightLabel(180, system)}.</Text>
  </View>;
}
