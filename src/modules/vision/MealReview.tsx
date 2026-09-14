import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Action, Field, NumericField } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { gramsToOz } from '../../lib/units';
import { reportion, totalMacros, type RecognizedItem } from './resolveItems';

/** Below this the row is worth a second look before it is logged, not worth hiding. */
const UNSURE = 0.5;

function Row({ item, onGrams, onRemove }: { item: RecognizedItem; onGrams: (grams: number | null) => void; onRemove: () => void }) {
  const unsure = item.confidence < UNSURE;
  return <View className="mb-3 rounded-2xl border border-border bg-surface p-4">
    <View className="flex-row items-start gap-3">
      <View className="flex-1">
        <Text className="text-lg font-bold">{item.name}</Text>
        <Text className="mt-1 text-sm">
          {item.source === 'usda'
            ? `USDA · ${item.matchedName}`
            : 'Estimated from the photo — no USDA match, so no micronutrients for this row.'}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} weight="firm"
        onPress={() => { onRemove(); haptic('light'); }} className="rounded-xl bg-raised px-3 py-2">
        <Text className="font-bold">Remove</Text>
      </Pressable>
    </View>
    {unsure && <Text className="mt-2 rounded-xl bg-raised p-3 text-sm">
      Low confidence on this one. Check the weight, or describe it below and re-estimate.
    </Text>}
    <View className="mt-3 flex-row items-end gap-3">
      <View className="flex-1">
        <NumericField label="Weight · g" keyboardType="decimal-pad" value={Math.round(item.grams)} onValue={onGrams} />
      </View>
      <View className="flex-1 pb-3">
        <Text className="text-sm">{gramsToOz(item.grams).toFixed(1)} oz</Text>
      </View>
    </View>
    <Text className="text-sm">
      {Math.round(item.macros.caloriesKcal)} kcal · P {item.macros.proteinG.toFixed(1)} g · C {item.macros.carbsG.toFixed(1)} g · F {item.macros.fatG.toFixed(1)} g
    </Text>
  </View>;
}

export function MealReview({ items, note, busy, onChange, onRefine, onConfirm, onCancel }: {
  items: RecognizedItem[];
  note: string | null;
  busy: boolean;
  onChange: (items: RecognizedItem[]) => void;
  /** Re-runs the estimate against the same photos plus the user's own words. */
  onRefine: (description: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState('');
  const totals = useMemo(() => totalMacros(items), [items]);
  const estimated = items.filter(item => item.source === 'estimated').length;

  return <>
    <Text className="mb-2 text-sm font-bold tracking-widest">WHAT WE FOUND</Text>
    <Text className="mb-4">
      {items.length === 1 ? 'One food' : `${items.length} foods`} · {Math.round(totals.caloriesKcal)} kcal in total.
      Every row is editable, and each is logged as its own diary entry.
    </Text>
    {!!note && <View className="mb-4 rounded-2xl bg-raised p-4">
      <Text className="font-bold">Worth checking</Text><Text className="mt-1 text-sm">{note}</Text>
    </View>}

    {items.map((item, index) => <Row key={`${item.name}-${index}`} item={item}
      onGrams={grams => onChange(items.map((row, at) => at === index && grams ? reportion(row, grams) : row))}
      onRemove={() => onChange(items.filter((_row, at) => at !== index))} />)}

    {!items.length && <Text className="mb-4 rounded-2xl bg-raised p-4">
      Every row was removed. Add a description and re-estimate, or close and enter the meal by hand.
    </Text>}

    <View className="mb-3 mt-2 rounded-2xl border border-border bg-surface p-4">
      <Text className="mb-1 font-bold">Anything we got wrong? (optional)</Text>
      <Text className="mb-3 text-sm">
        Facts a photo cannot show — what it was cooked in, how much you actually ate, what is under the sauce.
        {estimated > 0 ? ` ${estimated === 1 ? 'One row' : `${estimated} rows`} had no USDA match, so naming the food helps most.` : ''}
      </Text>
      <Field label="Describe this meal" value={description} onChangeText={setDescription}
        multiline maxLength={500} placeholder="Half the rice was left, and it was cooked in butter." />
      <Action secondary label={busy ? 'Re-estimating…' : 'Update the estimate'}
        disabled={busy || !description.trim()} onPress={() => onRefine(description.trim())} />
    </View>

    <Text className="mb-3 text-sm">
      Totals · {Math.round(totals.caloriesKcal)} kcal · P {totals.proteinG.toFixed(1)} g · C {totals.carbsG.toFixed(1)} g · F {totals.fatG.toFixed(1)} g
    </Text>
    <Action label={`Log ${items.length} ${items.length === 1 ? 'food' : 'foods'}`}
      disabled={busy || !items.length} onPress={onConfirm} tone="success" />
    <Action secondary label="Discard and close" onPress={onCancel} />
  </>;
}
