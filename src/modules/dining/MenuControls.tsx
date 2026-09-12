import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Field } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import {
  MENU_SORTS, QUICK_FILTERS, activeMenuFilterCount,
  type MenuFilterState, type MenuSort, type QuickFilter,
} from './menuFilters';

function Chip({ label, selected, hint, onPress }: { label: string; selected: boolean; hint?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={hint ? `${label}. ${hint}` : label}
    onPress={() => { onPress(); haptic('selection'); }} tone="selection" weight="subtle"
    className={`mr-2 min-h-11 justify-center rounded-full border px-4 ${selected ? 'border-accent bg-raised' : 'border-border bg-surface'}`}>
    <Text className={selected ? 'text-sm font-bold' : 'text-sm'}>{selected ? `✓ ${label}` : label}</Text>
  </Pressable>;
}

/**
 * A dining hall lunch runs past 200 dishes across 20 stations, so the menu is a database
 * that needs querying, not a list to scroll. Chips within a group are an OR; groups AND.
 */
export function MenuControls({ filters, onChange, stations, shown, total, remainingKcal }: {
  filters: MenuFilterState; onChange: (next: MenuFilterState) => void;
  stations: readonly string[]; shown: number; total: number; remainingKcal: number | null;
}) {
  const [open, setOpen] = useState<'quick' | 'station' | 'sort' | null>(null);
  const count = activeMenuFilterCount(filters);
  const toggleQuick = (value: QuickFilter) => onChange({ ...filters,
    quick: filters.quick.includes(value) ? filters.quick.filter(item => item !== value) : [...filters.quick, value] });
  const toggleStation = (value: string) => onChange({ ...filters,
    stations: filters.stations.includes(value) ? filters.stations.filter(item => item !== value) : [...filters.stations, value] });
  const sortLabel = useMemo(() => MENU_SORTS.find(([value]) => value === filters.sort)?.[1] ?? 'By station', [filters.sort]);

  return <View className="mb-4">
    <Field label="Search this menu" value={filters.query} onChangeText={query => onChange({ ...filters, query })}
      autoCorrect={false} placeholder="grilled chicken, rice, tofu…" />
    <View className="mb-1 flex-row flex-wrap">
      <Chip label={filters.quick.length ? `Filters · ${filters.quick.length}` : 'Filters'} selected={open === 'quick'}
        onPress={() => setOpen(current => current === 'quick' ? null : 'quick')} />
      <Chip label={filters.stations.length ? `Stations · ${filters.stations.length}` : 'Stations'} selected={open === 'station'}
        onPress={() => setOpen(current => current === 'station' ? null : 'station')} />
      <Chip label={sortLabel} selected={open === 'sort'} onPress={() => setOpen(current => current === 'sort' ? null : 'sort')} />
      {count > 0 && <Chip label="Clear" selected={false} onPress={() => { onChange({ ...filters, stations: [], quick: [] }); setOpen(null); }} />}
    </View>
    {open === 'quick' && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingRight: 20, paddingVertical: 4 }}>
      {QUICK_FILTERS.map(([value, label, hint]) => <Chip key={value} label={label} hint={hint}
        selected={filters.quick.includes(value)} onPress={() => toggleQuick(value)} />)}
    </ScrollView>}
    {open === 'station' && (stations.length
      ? <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingRight: 20, paddingVertical: 4 }}>
          {stations.map(station => <Chip key={station} label={station} selected={filters.stations.includes(station)} onPress={() => toggleStation(station)} />)}
        </ScrollView>
      : <Text className="py-2 text-sm">This hall did not publish stations for this meal.</Text>)}
    {open === 'sort' && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingRight: 20, paddingVertical: 4 }}>
      {MENU_SORTS.map(([value, label]) => <Chip key={value} label={label} selected={filters.sort === value}
        onPress={() => onChange({ ...filters, sort: value as MenuSort })} />)}
    </ScrollView>}
    <Text className="mt-2 text-sm">
      {shown === total ? `${total} dishes` : `${shown} of ${total} dishes`}
      {filters.quick.includes('fits') && remainingKcal !== null ? ` · within your ${Math.round(remainingKcal)} kcal left` : ''}
    </Text>
    {filters.quick.length > 0 && <Text className="mt-1 text-xs">Dishes the hall did not publish a value for are left out of a filter rather than counted as zero.</Text>}
  </View>;
}
