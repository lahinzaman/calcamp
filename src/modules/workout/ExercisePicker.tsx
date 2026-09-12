import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Field } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { EXERCISE_CATALOG, type CatalogExercise } from './catalog';
import { ExerciseHelp } from './ExerciseHelp';
import { activeFilterCount, equipmentFacets, filterExercises, muscleFacets, muscleLabel, patternFacets, patternLabel, type Facet } from './search';

type Group = 'muscles' | 'equipment' | 'patterns';
const GROUP_LABELS: Record<Group, string> = { muscles: 'Muscle', equipment: 'Equipment', patterns: 'Movement' };

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={label}
    onPress={() => { onPress(); haptic('selection'); }} tone="selection" weight="subtle"
    className={`mr-2 min-h-11 justify-center rounded-full border px-4 ${selected ? 'border-accent bg-raised' : 'border-border bg-surface'}`}>
    <Text className={selected ? 'text-sm font-bold' : 'text-sm'}>{selected ? `✓ ${label}` : label}</Text>
  </Pressable>;
}

function FacetRow({ facets, selected, onToggle }: { facets: Facet[]; selected: readonly string[]; onToggle: (value: string) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
    contentContainerStyle={{ paddingRight: 20, paddingVertical: 4 }}>
    {facets.map(item => <Chip key={item.value} label={`${item.label} (${item.count})`}
      selected={selected.includes(item.value)} onPress={() => onToggle(item.value)} />)}
  </ScrollView>;
}

/**
 * Browsing 230-odd exercises by scrolling does not work, so the list is narrowed by
 * typed words and by chips. One open facet row at a time keeps the list on screen.
 */
export function ExercisePicker({ catalog = EXERCISE_CATALOG, selectedIds, onToggle, footer }: {
  catalog?: readonly CatalogExercise[]; selectedIds: readonly string[];
  onToggle: (id: string) => void; footer: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Group | null>(null);
  const [filters, setFilters] = useState<Record<Group, string[]>>({ muscles: [], equipment: [], patterns: [] });
  const facets = useMemo(() => ({ muscles: muscleFacets(catalog), equipment: equipmentFacets(catalog), patterns: patternFacets(catalog) }), [catalog]);
  const matches = useMemo(() => filterExercises(catalog, { query, ...filters }), [catalog, query, filters]);
  const count = activeFilterCount(filters);
  const toggleFilter = (group: Group, value: string) => setFilters(current => ({ ...current,
    [group]: current[group].includes(value) ? current[group].filter(item => item !== value) : [...current[group], value] }));

  return <>
    <View className="px-5 pt-2">
      <Field label="Search exercises" value={query} onChangeText={setQuery} autoCorrect={false} placeholder="cable row, split squat…" />
      <View className="mb-1 flex-row">
        {(Object.keys(GROUP_LABELS) as Group[]).map(group => <Chip key={group}
          label={filters[group].length ? `${GROUP_LABELS[group]} · ${filters[group].length}` : GROUP_LABELS[group]}
          selected={open === group} onPress={() => setOpen(current => current === group ? null : group)} />)}
        {count > 0 && <Chip label="Clear" selected={false} onPress={() => { setFilters({ muscles: [], equipment: [], patterns: [] }); setOpen(null); }} />}
      </View>
      {open && <FacetRow facets={facets[open]} selected={filters[open]} onToggle={value => toggleFilter(open, value)} />}
      <Text className="mb-2 mt-2 text-sm">{matches.length} of {catalog.length} exercises · {selectedIds.length} selected</Text>
    </View>
    {matches.length === 0
      ? <View className="flex-1 items-center justify-center px-8"><Text className="text-center">Nothing matches that. Clear a filter or search for a shorter word.</Text></View>
      : <FlashList data={matches} keyExtractor={exercise => exercise.id} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
          renderItem={({ item }) => {
            const chosen = selectedIds.includes(item.id);
            return <View className="mb-2 flex-row items-center gap-2">
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: chosen }} accessibilityLabel={item.name}
                onPress={() => { onToggle(item.id); haptic('selection'); }} weight="subtle"
                className={`flex-1 rounded-2xl border p-4 ${chosen ? 'border-accent bg-raised' : 'border-border bg-surface'}`}>
                <Text className="font-bold">{chosen ? '✓ ' : ''}{item.name}</Text>
                <Text className="text-sm">{muscleLabel(item.primaryMuscle)} · {item.equipment} · {patternLabel(item.movementPattern ?? '')}</Text>
              </Pressable>
              <ExerciseHelp exercise={item} />
            </View>;
          }} />}
    <View className="gap-2 px-5 pb-4">{footer}</View>
  </>;
}