import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Reveal } from '../../theme/motion';
import { Action, Field } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { useAuthStore } from '../../store/authStore';
import { localDateKey } from '../../store/nutritionStore';
import { shiftDate } from '../../api/history';
import { MEASUREMENT_FIELDS, loadMeasurements, saveMeasurement, type MeasurementField } from '../../api/measurements';
const blank = () => Object.fromEntries(MEASUREMENT_FIELDS.map(([field]) => [field, ''])) as Record<MeasurementField, string>;
export function MeasurementsCard({ index = 6 }: { index?: number }) {
  const owner = useAuthStore(s => s.session?.user.id);
  const today = localDateKey(new Date());
  const queries = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(blank);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const history = useQuery({ enabled: !!owner, queryKey: ['measurements', owner, today],
    queryFn: () => loadMeasurements(owner!, shiftDate(today, -364), today), staleTime: 300000 });
  const rows = history.data ?? [];
  const latest = rows[rows.length - 1];
  const first = rows[0];
  const save = async () => {
    if (!owner || busy) return;
    setBusy(true); setError(null);
    try {
      const numbers = Object.fromEntries(MEASUREMENT_FIELDS.map(([field]) => [field, values[field].trim() ? Number(values[field]) : null]));
      if (Object.values(numbers).some(value => value !== null && (!Number.isFinite(value) || value <= 0))) throw new Error('Measurements must be positive numbers.');
      await saveMeasurement(owner, { id: `${owner}:${today}`, measured_on: today, note: null, ...numbers });
      await queries.invalidateQueries({ queryKey: ['measurements', owner, today] });
      setValues(blank()); setOpen(false); haptic('success');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your measurements could not be saved.'); haptic('error'); }
    finally { setBusy(false); }
  };
  const change = (field: MeasurementField) => {
    if (!latest || !first || first === latest) return null;
    const from = first[field]; const to = latest[field];
    if (typeof from !== 'number' || typeof to !== 'number') return null;
    return Number((to - from).toFixed(1));
  };
  return <Reveal index={index}><View className="mb-4 rounded-3xl border border-border bg-surface p-5">
    <Pressable accessibilityRole="button" accessibilityLabel="Body measurements" accessibilityState={{ expanded: open }}
      weight="subtle" onPress={() => setOpen(value => !value)} className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <Text className="text-sm font-bold tracking-widest">BODY MEASUREMENTS</Text>
        <Text className="mt-1">{latest ? `Last recorded ${latest.measured_on}` : 'Weight alone hides recomposition. Tape does not.'}</Text>
      </View>
      <Text>{open ? '▴' : '▾'}</Text>
    </Pressable>
    {!!rows.length && <View className="mt-4 flex-row flex-wrap gap-4">
      {MEASUREMENT_FIELDS.filter(([field]) => typeof latest?.[field] === 'number').map(([field, label]) => {
        const delta = change(field);
        return <View key={field} style={{ flexGrow: 1, flexBasis: 100 }}>
          <Text className="text-2xl font-bold">{latest![field]}</Text>
          <Text className="text-sm">{label.split(' · ')[0]}</Text>
          {delta !== null && delta !== 0 && <Text className="text-sm">{delta > 0 ? '+' : ''}{delta} since {first!.measured_on}</Text>}
        </View>;
      })}
    </View>}
    {open && <View className="mt-4">
      <Text className="mb-3 text-sm">Record what you measured today. Leave anything you did not measure blank — blank stays unknown, not zero.</Text>
      {MEASUREMENT_FIELDS.map(([field, label]) => <Field key={field} label={label} value={values[field]}
        onChangeText={text => setValues(current => ({ ...current, [field]: text }))} keyboardType="decimal-pad" />)}
      {error && <Text accessibilityRole="alert" className="mb-3">{error}</Text>}
      <Action label={busy ? 'Saving…' : 'Save measurements'} disabled={busy} onPress={() => void save()} tone="success" />
    </View>}
  </View></Reveal>;
}
