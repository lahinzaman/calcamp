import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Text } from '../../theme/primitives';
import { MAINTAIN_TOP } from '../../components/listBehavior';
import { Pressable } from '../../theme/Pressable';
import { TextInput } from '../../theme/primitives';
import { haptic } from '../../theme/haptics';
import { useT } from '../../i18n';
import { fullCatalog, type CatalogExercise } from './catalog';
import { ExerciseHelp } from './ExerciseHelp';
import { activeFilterCount, equipmentFacets, filterExercises, muscleFacets, muscleLabel, patternFacets, patternLabel, type Facet } from './search';
import { secondaryMuscles } from './synergists';

type Group = 'muscles' | 'equipment' | 'patterns';
const GROUP_LABELS: Record<Group, string> = { muscles: 'Muscle', equipment: 'Equipment', patterns: 'Movement' };

const ExerciseRow = memo(function ExerciseRow({ exercise, chosen, onToggle, onEdit }: {
  exercise: CatalogExercise; chosen: boolean; onToggle: (id: string) => void; onEdit?: (exercise: CatalogExercise) => void;
}) {
  const mine = !!exercise.ownerUserId;
  return <View className="mb-2 flex-row items-center gap-2">
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: chosen }} accessibilityLabel={exercise.name}
      onPress={() => { onToggle(exercise.id); haptic('selection'); }} weight="subtle"
      className={`flex-1 rounded-2xl border p-4 ${chosen ? 'border-accent bg-raised' : 'border-border bg-surface'}`}>
      <Text className="font-bold">{chosen ? '✓ ' : ''}{exercise.name}</Text>
      <Text className="mt-0.5 text-sm">{muscleLabel(exercise.primaryMuscle)} · {exercise.equipment} · {patternLabel(exercise.movementPattern ?? '')}</Text>
      {secondaryMuscles(exercise).length > 0 && <Text className="mt-0.5 text-xs">Also works {secondaryMuscles(exercise).map(muscleLabel).join(', ')}</Text>}
      {mine && <Text className="mt-0.5 text-xs">Yours</Text>}
    </Pressable>
    {/* Only your own exercises are yours to change; the shared catalogue is read-only. */}
    {mine && onEdit && <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${exercise.name}`}
      onPress={() => { onEdit(exercise); haptic('selection'); }} weight="subtle"
      className="h-11 w-11 items-center justify-center rounded-full bg-raised"><Text className="font-bold">✎</Text></Pressable>}
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
export function ExercisePicker({ catalog, selectedIds, onToggle, footer, onClose, onCreate, onEdit }: {
  catalog?: readonly CatalogExercise[]; selectedIds: readonly string[];
  onToggle: (id: string) => void; footer: React.ReactNode; onClose?: () => void;
  /** Offered when the list comes up empty, which is exactly when a gym has something odd. */
  onCreate?: () => void;
  /** Offered on the rows this account created, which are the only editable ones. */
  onEdit?: (exercise: CatalogExercise) => void;
}) {
  const t = useT();
  // Resolved per render rather than defaulted in the signature, so an exercise created from
  // inside this sheet is in the list the moment it is saved.
  const available = catalog ?? fullCatalog();
  const [term, setTerm] = useState('');
  // Re-filtering 200-odd rows on every keystroke made the list thrash under the keyboard.
  const [query, setQuery] = useState('');
  useEffect(() => { const id = setTimeout(() => setQuery(term), 180); return () => clearTimeout(id); }, [term]);
  const [open, setOpen] = useState<Group | null>(null);
  const [filters, setFilters] = useState<Record<Group, string[]>>({ muscles: [], equipment: [], patterns: [] });
  const facets = useMemo(() => ({ muscles: muscleFacets(available), equipment: equipmentFacets(available), patterns: patternFacets(available) }), [available]);
  const matches = useMemo(() => filterExercises(available, { query, ...filters }), [available, query, filters]);
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
      <Text className="mb-2 mt-2 text-sm">{matches.length} of {available.length} exercises · {selectedIds.length} selected</Text>
    </View>
    {matches.length === 0
      ? <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center">Nothing matches that. Clear a filter or search for a shorter word.</Text>
          {/* Coming up empty is the moment you most want this: the machine in front of you is
              not in the catalogue, and you are about to do sets on it anyway. */}
          {onCreate && <Pressable accessibilityRole="button" accessibilityLabel="Create your own exercise"
            onPress={() => { onCreate(); haptic('selection'); }} weight="subtle"
            className="mt-4 min-h-12 justify-center rounded-xl bg-raised px-5">
            <Text className="font-semibold">＋ Create your own exercise</Text></Pressable>}
        </View>
      : <FlashList ref={list} data={matches} keyExtractor={exercise => exercise.id} style={{ flex: 1 }} keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag"
          maintainVisibleContentPosition={MAINTAIN_TOP}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
          renderItem={({ item }) => <ExerciseRow exercise={item} chosen={selectedIds.includes(item.id)} onToggle={onToggle} onEdit={onEdit} />} />}
    <View className="gap-2 px-5 pb-4">
      {onCreate && matches.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Create your own exercise"
        onPress={() => { onCreate(); haptic('selection'); }} weight="subtle"
        className="min-h-11 justify-center"><Text className="text-center text-sm font-semibold">＋ Create your own exercise</Text></Pressable>}
      {footer}
    </View>
  </>;
}