import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Text } from '../../theme/primitives';
import { MAINTAIN_TOP } from '../../components/listBehavior';
import { Pressable } from '../../theme/Pressable';
import { TextInput } from '../../theme/primitives';
import { haptic } from '../../theme/haptics';
import { useT } from '../../i18n';
import { EXERCISE_CATALOG, type CatalogExercise } from './catalog';
import { ExerciseHelp } from './ExerciseHelp';
import { activeFilterCount, equipmentFacets, filterExercises, muscleFacets, muscleLabel, patternFacets, patternLabel, type Facet } from './search';
import { secondaryMuscles } from './synergists';

type Group = 'muscles' | 'equipment' | 'patterns';
const GROUP_LABELS: Record<Group, string> = { muscles: 'Muscle', equipment: 'Equipment', patterns: 'Movement' };

const ExerciseRow = memo(function ExerciseRow({ exercise, chosen, onToggle }: { exercise: CatalogExercise; chosen: boolean; onToggle: (id: string) => void }) {
  return <View className="mb-2 flex-row items-center gap-2">
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: chosen }} accessibilityLabel={exercise.name}
      onPress={() => { onToggle(exercise.id); haptic('selection'); }} weight="subtle"
      className={`flex-1 rounded-2xl border p-4 ${chosen ? 'border-accent bg-raised' : 'border-border bg-surface'}`}>
      <Text className="font-bold">{chosen ? '✓ ' : ''}{exercise.name}</Text>
      <Text className="mt-0.5 text-sm">{muscleLabel(exercise.primaryMuscle)} · {exercise.equipment} · {patternLabel(exercise.movementPattern ?? '')}</Text>
      {secondaryMuscles(exercise).length > 0 && <Text className="mt-0.5 text-xs">Also works {secondaryMuscles(exercise).map(muscleLabel).join(', ')}</Text>}
    </Pressable>
    <ExerciseHelp exercise={exercise} />
  </View>;
});

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
export function ExercisePicker({ catalog = EXERCISE_CATALOG, selectedIds, onToggle, footer, onClose }: {
  catalog?: readonly CatalogExercise[]; selectedIds: readonly string[];
  onToggle: (id: string) => void; footer: React.ReactNode; onClose?: () => void;
}) {
  const t = useT();
  const [term, setTerm] = useState('');
  // Re-filtering 200-odd rows on every keystroke made the list thrash under the keyboard.
  const [query, setQuery] = useState('');
  useEffect(() => { const id = setTimeout(() => setQuery(term), 180); return () => clearTimeout(id); }, [term]);
  const [open, setOpen] = useState<Group | null>(null);
  const [filters, setFilters] = useState<Record<Group, string[]>>({ muscles: [], equipment: [], patterns: [] });
  const facets = useMemo(() => ({ muscles: muscleFacets(catalog), equipment: equipmentFacets(catalog), patterns: patternFacets(catalog) }), [catalog]);
  const matches = useMemo(() => filterExercises(catalog, { query, ...filters }), [catalog, query, filters]);
  // Narrowing 232 exercises to a handful while scrolled halfway down left the list parked past
  // its own end, showing nothing. New results start at the top.
  //
  // The reset alone was not enough. FlashList v2 turns `maintainVisibleContentPosition` on by
  // default, which anchors the scroll to whatever row was visible and re-applies that offset on
  // the layout pass *after* this effect runs — so narrowing, and then clearing the search again,
  // both put you back in the middle of the list. Search results are read from the top, so
  // MAINTAIN_TOP turns the anchoring off.
  const list = useRef<FlashListRef<CatalogExercise>>(null);
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }); }, [query, filters]);
  const count = activeFilterCount(filters);
  const toggleFilter = (group: Group, value: string) => setFilters(current => ({ ...current,
    [group]: current[group].includes(value) ? current[group].filter(item => item !== value) : [...current[group], value] }));

  return <>
    <View className="px-5 pt-2">
      <View className="mb-4">
        <View className="mb-2 flex-row items-center justify-between gap-3">
          <Text className="text-sm font-semibold">{t('train.searchExercises')}</Text>
          {onClose && <Pressable accessibilityRole="button" accessibilityLabel={t('train.closeSearch')} onPress={onClose} weight="subtle"
            className="h-10 w-10 items-center justify-center rounded-full bg-raised"><Text className="text-lg font-bold">✕</Text></Pressable>}
        </View>
        <View className="flex-row items-center gap-2 rounded-xl border border-border bg-surface px-2">
          <TextInput accessibilityLabel={t('train.searchExercises')} value={term} onChangeText={setTerm} autoCorrect={false}
            placeholder="cable row, split squat…" className="flex-1 px-2 py-3 text-base" />
          {!!term && <Pressable accessibilityRole="button" accessibilityLabel={t('train.clearSearch')} onPress={() => { setTerm(''); setQuery(''); haptic('selection'); }}
            weight="subtle" className="h-9 w-9 items-center justify-center rounded-full bg-raised"><Text className="font-bold">✕</Text></Pressable>}
        </View>
      </View>
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
      : <FlashList ref={list} data={matches} keyExtractor={exercise => exercise.id} style={{ flex: 1 }} keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag"
          maintainVisibleContentPosition={MAINTAIN_TOP}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
          renderItem={({ item }) => <ExerciseRow exercise={item} chosen={selectedIds.includes(item.id)} onToggle={onToggle} />} />}
    <View className="gap-2 px-5 pb-4">{footer}</View>
  </>;
}