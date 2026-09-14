import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Action, Choice, Field } from '../../components/FormControls';
import { LoadingCards } from '../../components/LoadingCards';
import { confirmToast } from '../../components/Toast';
import { haptic } from '../../theme/haptics';
import { nutritionStore } from '../../store/nutritionStore';
import { useAuthStore } from '../../store/authStore';
import { searchFoods, type SearchResult } from '../../api/foodSearch';
import { QUALITY_LABELS, UsdaRateLimited, searchUsdaFoods } from '../../api/usda';
import { searchBundledFoods, toSearchResult } from '../../data/usdaFoods';
import { MEAL_LABELS, MEAL_SLOTS, mealForHour, scaleMacros, type MealSlot } from '../../types/foodEntry';
import { orderFoods, readSavedFoods, rememberFood, toggleFavorite, forgetFood, type SavedFood } from './savedFoods';
import { foodEmoji } from '../dining/foodEmoji';
import { RecipeBuilder } from './RecipeBuilder';
import { deleteRecipe, perServing, readRecipes, type Recipe } from './recipes';
import { RecipeImportError, importRecipe, toRecipeDraft } from '../../api/recipeImport';
import { DINING_HALL_SLUGS, MEAL_TYPE_LABELS, useDiningMenu } from './useDiningMenu';
import { DINING_HALLS } from '../../types/campus';
import { MEAL_TYPES, type DailyMenuItem } from '../../types/nutrislice';
import { servingLabel } from '../dining/serving';
import { FoodLogSheet } from '../dining/FoodLogSheet';
import { useT, type MessageKey } from '../../i18n';
import { DRINK_CATEGORIES, drinkMacros, drinkMicros, drinkNote, drinksInCategory, searchDrinks, servingLabelFor, type Drink, type DrinkCategory } from '../../data/alcohol';
type Tab = 'recent' | 'frequent' | 'favorite' | 'recipe' | 'drinks' | 'dining' | 'search';
const TABS: [Tab, MessageKey][] = [['search', 'food.tabSearch'], ['dining', 'food.tabDining'], ['recent', 'food.tabRecent'], ['frequent', 'food.tabFrequent'], ['favorite', 'food.tabFavorites'], ['recipe', 'food.tabRecipes'], ['drinks', 'food.tabDrinks']];
const drinkCandidate = (drink: Drink): Candidate => ({ name: drink.name, servingLabel: servingLabelFor(drink),
  macros: drinkMacros(drink), micros: drinkMicros(drink), source: 'custom', note: drinkNote(drink) });
interface FoodItem { kind: 'food'; id: string; title: string; subtitle: string; candidate: Candidate;
  starred?: boolean; onStar?: () => void; onRemove?: () => void }
type LibraryItem =
  | FoodItem
  | { kind: 'heading'; id: string; text: string }
  | { kind: 'note'; id: string; text: string; small?: boolean; alert?: boolean }
  | { kind: 'loading'; id: string }
  | { kind: 'menu'; id: string; item: DailyMenuItem };
type Candidate = { name: string; servingLabel: string | null; macros: SearchResult['macros']; micros: SearchResult['micros']; source: SavedFood['source']; note?: string };
/**
 * Everything the app can turn into a diary entry, in one place: the packaged-food search,
 * campus dining, your own recipes and saved foods, and the drinks catalogue. The + sheet and
 * the Food tab render the same component so they can never drift apart.
 */
export function FoodLibrary({ meal, onDone, footer, header }: {
  meal?: MealSlot; onDone: () => void; footer?: React.ReactNode;
  /** Rendered above the tabs, inside the fixed chrome. */
  header?: React.ReactNode;
}) {
  const t = useT();
  const owner = useAuthStore(s => s.session?.user.id) ?? 'anonymous';
  const [tab, setTab] = useState<Tab>('search');
  const [category, setCategory] = useState<DrinkCategory>('beer');
  const [term, setTerm] = useState(''); const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<SavedFood[]>(() => readSavedFoods(owner));
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>(() => readRecipes(owner));
  const [building, setBuilding] = useState<Recipe | 'new' | null>(null);
  const [recipeUrl, setRecipeUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importRequest = useRef<AbortController | null>(null);
  useEffect(() => () => importRequest.current?.abort(), []);
  // Two delays, not one. The bundled catalogues answer in under a millisecond but still rebuild
  // every visible row, so they wait long enough to skip the keystrokes in between; the network
  // waits longer again. Before this the local lists ran on the raw term and the list thrashed
  // under the keyboard while the debounced value went unused for them.
  const [localQuery, setLocalQuery] = useState('');
  useEffect(() => { const id = setTimeout(() => setLocalQuery(term.trim()), 120); return () => clearTimeout(id); }, [term]);
  useEffect(() => { const id = setTimeout(() => setQuery(term), 400); return () => clearTimeout(id); }, [term]);
  // Switching tab or running a new search replaces every row. Without this the list kept its
  // old offset and a short result set left you looking at empty space below it.
  const listRef = useRef<FlashListRef<LibraryItem>>(null);
  useEffect(() => { listRef.current?.scrollToOffset({ offset: 0, animated: false }); }, [tab, localQuery]);
  const enabled = tab === 'search' && query.trim().length >= 2;
  // USDA first: it is the only source that publishes a full micronutrient profile.
  const usda = useQuery({ enabled, queryKey: ['usda-search', query],
    queryFn: ({ signal }) => searchUsdaFoods(query, signal), retry: false, staleTime: 300_000 });
  const results = useQuery({ enabled, queryKey: ['food-search', query],
    queryFn: ({ signal }) => searchFoods(query, signal), retry: false, staleTime: 300000 });
  const dining = useDiningMenu();
  const list = useMemo(() => orderFoods(saved, tab === 'recent' || tab === 'frequent' || tab === 'favorite' ? tab : 'recent'), [saved, tab]);
  // The drinks catalogue is bundled, so it answers instantly and works with no connection.
  const drinkMatches = useMemo(() => tab === 'search' ? searchDrinks(localQuery) : [], [tab, localQuery]);
  const bundled = useMemo(() => tab === 'search' ? searchBundledFoods(localQuery).map(toSearchResult) : [], [tab, localQuery]);
  // The live API repeats much of what is bundled; drop those rows rather than list them twice.
  const branded = useMemo(() => {
    const known = new Set(bundled.map(food => food.name.toLowerCase()));
    return (usda.data ?? []).filter(food => !known.has(food.name.toLowerCase()));
  }, [usda.data, bundled]);
  /**
   * Every tab flattened to one list. The rows used to be `.map`ped straight into a ScrollView,
   * so all of them stayed mounted — 54 beers, a full history — and scrolling had to carry the
   * lot. Headings and notes travel as list items so a section keeps its heading while the rows
   * under it recycle.
   */
  const items = useMemo<LibraryItem[]>(() => {
    const out: LibraryItem[] = [];
    const food = (id: string, title: string, subtitle: string, candidate: Candidate, extra: Partial<FoodItem> = {}) =>
      out.push({ kind: 'food', id, title, subtitle, candidate, ...extra });
    if (tab === 'search') {
      if (drinkMatches.length) {
        out.push({ kind: 'heading', id: 'head-drinks', text: t('food.drinksHeading') });
        for (const drink of drinkMatches) food(`drink:${drink.name}`, drink.name,
          `${drinkMacros(drink).caloriesKcal} kcal · ${servingLabelFor(drink)}`, drinkCandidate(drink));
        out.push({ kind: 'note', id: 'note-drinks', small: true,
          text: 'Drink energy is calculated from ABV and published carbohydrate, not read off a label.' });
      }
      if (results.isLoading || usda.isLoading) out.push({ kind: 'loading', id: 'loading' });
      if (usda.error instanceof UsdaRateLimited) out.push({ kind: 'note', id: 'note-rate', small: true, text: usda.error.message });
      if (bundled.length) {
        out.push({ kind: 'heading', id: 'head-usda', text: t('food.usdaHeading') });
        for (const result of bundled) food(result.key, result.name,
          `${Math.round(result.macros.caloriesKcal)} kcal · ${result.servingLabel} · ${Object.keys(result.micros).length} ${t('food.nutrients')}`,
          { name: result.name, servingLabel: result.servingLabel, macros: result.macros, micros: result.micros, source: 'custom' });
      }
      if (branded.length) {
        out.push({ kind: 'heading', id: 'head-branded', text: t('food.brandedHeading') });
        for (const result of branded) food(result.key, result.name,
          `${result.brand ? `${result.brand} · ` : ''}${Math.round(result.macros.caloriesKcal)} kcal per ${result.servingLabel} · ${Object.keys(result.micros).length} ${t('food.nutrients')} · ${QUALITY_LABELS[(result.quality ?? 'reference') as 'lab']}`,
          { name: result.name, servingLabel: result.servingLabel, macros: result.macros, micros: result.micros, source: 'custom' });
      }
      if (results.isError && !bundled.length && !branded.length) out.push({ kind: 'note', id: 'note-unavailable', alert: true, text: t('food.unavailable') });
      if (results.data?.length === 0 && !bundled.length && !branded.length && !drinkMatches.length) {
        out.push({ kind: 'note', id: 'note-empty', text: t('food.noResults', { query: localQuery }) });
      }
      if (results.data?.length) {
        out.push({ kind: 'heading', id: 'head-packaged', text: t('food.packagedHeading') });
        for (const result of results.data) food(result.key, result.name,
          `${result.brand ? `${result.brand} · ` : ''}${Math.round(result.macros.caloriesKcal)} kcal per ${result.servingLabel} · ${Object.keys(result.micros).length} ${t('food.nutrients')}`,
          { name: result.name, servingLabel: result.servingLabel, macros: result.macros, micros: result.micros, source: 'custom' });
      }
    }
    if (tab === 'recipe') {
      if (importError) out.push({ kind: 'note', id: 'note-import', alert: true, text: importError });
      if (!recipes.length) out.push({ kind: 'note', id: 'note-recipes', text: t('food.noRecipes') });
      for (const recipe of recipes) {
        const single = perServing(recipe);
        food(recipe.id, recipe.name,
          `${Math.round(single.macros.caloriesKcal)} kcal per serving · makes ${recipe.yieldServings} · ${recipe.items.length} ingredients`,
          { name: recipe.name, servingLabel: 'serving', macros: single.macros, micros: single.micros, source: 'recipe' },
          { onRemove: () => { setRecipes(deleteRecipe(owner, recipe.id)); haptic('warning'); } });
      }
    }
    if (tab === 'dining') {
      if (dining.isPending) out.push({ kind: 'loading', id: 'menu-loading' });
      if (dining.isError) out.push({ kind: 'note', id: 'menu-error', alert: true,
        text: 'Campus menus are unavailable right now. Try again, or add this food by hand.' });
      if (dining.emptyReason) out.push({ kind: 'note', id: 'menu-empty', text: dining.emptyReason });
      for (const group of dining.groups) {
        out.push({ kind: 'heading', id: `station:${group.station}`, text: group.station.toUpperCase() });
        for (const item of group.items) out.push({ kind: 'menu', id: item.id, item });
      }
    }
    if (tab === 'drinks') {
      for (const drink of drinksInCategory(category)) food(drink.name, drink.name,
        `${drinkMacros(drink).caloriesKcal} kcal · ${servingLabelFor(drink)}`, drinkCandidate(drink));
    }
    if (tab === 'recent' || tab === 'frequent' || tab === 'favorite') {
      if (!list.length) out.push({ kind: 'note', id: 'note-saved', text: tab === 'favorite' ? t('food.noFavourites') : t('food.noHistory') });
      for (const saved of list) food(saved.key, saved.name,
        `${Math.round(saved.macros.caloriesKcal)} kcal${saved.servingLabel ? ` per ${saved.servingLabel}` : ''} · logged ${saved.uses}×`,
        { name: saved.name, servingLabel: saved.servingLabel, macros: saved.macros, micros: saved.micros, source: saved.source },
        { starred: saved.favorite,
          onStar: () => { setSaved(toggleFavorite(owner, saved.key)); haptic('selection'); },
          onRemove: () => { setSaved(forgetFood(owner, saved.key)); haptic('warning'); } });
    }
    return out;
  }, [tab, t, drinkMatches, results.isLoading, results.isError, results.data, usda.isLoading, usda.error,
      bundled, branded, localQuery, recipes, category, list, owner, importError,
      dining.isPending, dining.isError, dining.emptyReason, dining.groups]);

  /** Reads the page server-side, resolves it against USDA, and opens the builder on the draft. */
  const runImport = async () => {
    if (importing || !recipeUrl.trim()) return;
    importRequest.current?.abort();
    const controller = new AbortController(); importRequest.current = controller;
    setImporting(true); setImportError(null);
    try {
      const imported = await importRecipe(recipeUrl.trim(), controller.signal);
      if (controller.signal.aborted) return;
      const { recipe, estimated } = toRecipeDraft(imported);
      setBuilding(recipe); setRecipeUrl('');
      const caveats = [imported.note, estimated ? `${estimated} ${estimated === 1 ? 'ingredient' : 'ingredients'} had no USDA match and carry an estimate.` : null].filter(Boolean);
      if (caveats.length) confirmToast(caveats.join(' '));
    } catch (cause) {
      if (controller.signal.aborted) return;
      setImportError(cause instanceof RecipeImportError ? cause.message : 'That recipe could not be imported. Build it by hand instead.');
    } finally { if (!controller.signal.aborted) setImporting(false); }
  };

  return <View className="flex-1">
    {/* Tabs and the search field stay put. Scrolling a long result list used to carry them off
        the top of the screen, leaving no way back to either without scrolling all the way up. */}
    <View className="px-1">
      {header}
      <View className="mb-3 flex-row flex-wrap">{TABS.map(([value, messageKey]) => <Choice key={value} label={t(messageKey)} selected={tab === value} onPress={() => setTab(value)} />)}</View>
      {tab === 'search' && <Field label={t('food.searchLabel')} value={term} onChangeText={setTerm} autoCorrect={false}
        placeholder="Greek yogurt, chicken breast, Tito's, Bud Light…" />}
      {tab === 'recipe' && <>
        <Text className="mb-2 text-sm">Paste a recipe's web address and it is read into a draft you can check before saving. Nothing is saved until you do.</Text>
        <Field label="Recipe address" value={recipeUrl} onChangeText={text => { setRecipeUrl(text); setImportError(null); }}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…" />
        <Action secondary label={importing ? 'Reading the page…' : 'Import from a link'}
          disabled={importing || !recipeUrl.trim()} onPress={() => { void runImport(); }} />
      </>}
      {tab === 'dining' && <>
        <View className="mb-3 flex-row flex-wrap">{DINING_HALL_SLUGS.map(value => <Choice key={value} label={DINING_HALLS[value]}
          selected={dining.hall === value} onPress={() => dining.setHall(value)} />)}</View>
        <View className="mb-3 flex-row flex-wrap">{MEAL_TYPES.map(value => <Choice key={value} label={MEAL_TYPE_LABELS[value]}
          selected={dining.period === value} onPress={() => dining.setPeriod(value)} />)}</View>
        <Field label="Search today's menu" value={dining.query} onChangeText={dining.setQuery} autoCorrect={false}
          placeholder="grilled chicken, rice, tofu…" />
      </>}
      {tab === 'drinks' && <>
        <Text className="mb-3">Beer, wine, spirits and the rest, with the alcohol counted. Energy is calculated from ABV — a label always wins over this estimate.</Text>
        <View className="mb-3 flex-row flex-wrap">{DRINK_CATEGORIES.map(([value, label]) => <Choice key={value} label={label}
          selected={category === value} onPress={() => setCategory(value)} />)}</View>
      </>}
    </View>
    <FlashList ref={listRef} data={items} keyExtractor={item => item.id}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingBottom: 24 }}
      renderItem={({ item }) => <LibraryRow item={item} onChoose={setChosen} onPickMenuItem={dining.setSelected} />}
      ListFooterComponent={<View className="pt-2">
        {tab === 'recipe' && <Action secondary label={t('food.createRecipe')} onPress={() => setBuilding('new')} />}
        {footer}
      </View>} />
    {building && <RecipeBuilder owner={owner} existing={building === 'new' ? undefined : building}
      onClose={() => setBuilding(null)} onSaved={setRecipes} />}
    {chosen && <PortionSheet candidate={chosen} meal={meal} owner={owner} onBack={() => setChosen(null)} onDone={onDone} />}
    {dining.selected && <FoodLogSheet key={dining.selected.id} item={dining.selected} meal={meal}
      onClose={() => dining.setSelected(null)} onLogged={() => { dining.setSelected(null); onDone(); }} />}
  </View>;
}

/** An unreported campus macro is shown as a dash. Rounding it to zero would be a claim. */
const kcal = (value: number | null) => value === null ? '—' : String(Math.round(value));

function LibraryRow({ item, onChoose, onPickMenuItem }: {
  item: LibraryItem; onChoose: (candidate: Candidate) => void; onPickMenuItem: (item: DailyMenuItem) => void;
}) {
  if (item.kind === 'heading') return <Text className="mb-2 mt-2 text-sm font-bold tracking-widest">{item.text}</Text>;
  if (item.kind === 'note') return <Text accessibilityRole={item.alert ? 'alert' : undefined}
    className={item.small ? 'mb-3 mt-1 text-xs' : 'mb-3'}>{item.text}</Text>;
  if (item.kind === 'loading') return <LoadingCards label="Searching…" />;
  if (item.kind === 'menu') return <Row title={item.item.name}
    subtitle={`${kcal(item.item.macros.caloriesKcal)} kcal · P ${kcal(item.item.macros.proteinG)} · ${servingLabel(item.item.serving)}`}
    onPress={() => onPickMenuItem(item.item)} />;
  return <Row title={item.title} subtitle={item.subtitle} starred={item.starred}
    onStar={item.onStar} onRemove={item.onRemove} onPress={() => onChoose(item.candidate)} />;
}

export function FoodSearchModal({ onClose, meal }: { onClose: () => void; meal?: MealSlot }) {
  const t = useT();
  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View className="flex-1 px-5 pt-6">
        <FoodLibrary meal={meal} onDone={onClose}
          header={<Text className="mb-4 text-3xl font-bold">{t('food.addAFood')}</Text>}
          footer={<Action secondary label={t('common.close')} onPress={onClose} />} />
      </View>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}

function Row({ title, subtitle, onPress, starred, onStar, onRemove }: { title: string; subtitle: string; onPress: () => void; starred?: boolean; onStar?: () => void; onRemove?: () => void }) {
  return <View className="mb-2 flex-row items-center gap-2">
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} weight="subtle" className="flex-1 flex-row items-center gap-3 rounded-2xl bg-surface px-4 py-3">
      <Text className="text-2xl">{foodEmoji(title)}</Text>
      <View className="flex-1"><Text className="font-bold">{title}</Text><Text className="mt-0.5 text-sm">{subtitle}</Text></View>
    </Pressable>
    {onStar && <Pressable accessibilityRole="button" accessibilityLabel={starred ? `Unfavourite ${title}` : `Favourite ${title}`} onPress={onStar} weight="subtle" className="h-12 w-12 items-center justify-center rounded-full bg-raised"><Text>{starred ? '★' : '☆'}</Text></Pressable>}
    {onRemove && <Pressable accessibilityRole="button" accessibilityLabel={`Forget ${title}`} onPress={onRemove} weight="subtle" className="h-12 w-12 items-center justify-center rounded-full bg-raised"><Text>×</Text></Pressable>}
  </View>;
}
function PortionSheet({ candidate, meal, owner, onBack, onDone }: { candidate: Candidate; meal?: MealSlot; owner: string; onBack: () => void; onDone: () => void }) {
  const t = useT();
  const [servings, setServings] = useState('1');
  const [slot, setSlot] = useState<MealSlot>(meal ?? mealForHour(new Date().getHours()));
  const [error, setError] = useState<string | null>(null);
  const amount = Number(servings);
  const preview = Number.isFinite(amount) && amount > 0 ? scaleMacros(candidate.macros, amount) : null;
  const log = () => {
    try {
      nutritionStore.getState().addEntry({ name: candidate.name, meal: slot, servings: amount, servingLabel: candidate.servingLabel,
        referenceMacros: candidate.macros, referenceMicros: candidate.micros, source: candidate.source });
      rememberFood(owner, { name: candidate.name, servingLabel: candidate.servingLabel, macros: candidate.macros, micros: candidate.micros, source: candidate.source });
      confirmToast(`${candidate.name} added to ${MEAL_LABELS[slot].toLowerCase()} · ${Math.round((preview ?? candidate.macros).caloriesKcal)} kcal`);
      haptic('success'); onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the portion and try again.'); }
  };
  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onBack}>
    <SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text className="mb-1 text-3xl font-bold">{candidate.name}</Text>
        <Text className="mb-2 text-sm">{candidate.servingLabel ? `Per ${candidate.servingLabel}` : 'Per serving'} · {Math.round(candidate.macros.caloriesKcal)} kcal</Text>
        {!!candidate.note && <Text className="mb-4 text-sm">{candidate.note}</Text>}
        <Field label={t('food.servings')} value={servings} onChangeText={setServings} keyboardType="decimal-pad" />
        <View className="mb-4 flex-row flex-wrap">{[0.5, 1, 1.5, 2, 3].map(value => <Choice key={value} label={`${value}×`} selected={amount === value} onPress={() => setServings(String(value))} />)}</View>
        {preview && <View className="mb-5 rounded-3xl bg-surface p-5">
          <Text className="text-4xl font-bold">{Math.round(preview.caloriesKcal)} kcal</Text>
          <Text className="mt-2">Protein {Math.round(preview.proteinG)} g · Carbs {Math.round(preview.carbsG)} g · Fat {Math.round(preview.fatG)} g</Text>
        </View>}
        <Text className="mb-2 font-bold">{t('food.mealHeading')}</Text>
        <View className="mb-4 flex-row flex-wrap">{MEAL_SLOTS.map(value => <Choice key={value} label={MEAL_LABELS[value]} selected={slot === value} onPress={() => setSlot(value)} />)}</View>
        {error && <Text accessibilityRole="alert" className="mb-4">{error}</Text>}
        <Action label={t('food.logThis')} onPress={log} tone="success" />
        <Action secondary label={t('food.backToList')} onPress={onBack} />
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
