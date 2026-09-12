import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Action, Choice, Field } from '../../components/FormControls';
import { LoadingCards } from '../../components/LoadingCards';
import { haptic } from '../../theme/haptics';
import { nutritionStore } from '../../store/nutritionStore';
import { useAuthStore } from '../../store/authStore';
import { searchFoods, type SearchResult } from '../../api/foodSearch';
import { MEAL_LABELS, MEAL_SLOTS, mealForHour, scaleMacros, type MealSlot } from '../../types/foodEntry';
import { orderFoods, readSavedFoods, rememberFood, toggleFavorite, forgetFood, type SavedFood } from './savedFoods';
import { foodEmoji } from '../dining/foodEmoji';
import { RecipeBuilder } from './RecipeBuilder';
import { deleteRecipe, perServing, readRecipes, type Recipe } from './recipes';
import { DRINK_CATEGORIES, drinkMacros, drinkMicros, drinkNote, drinksInCategory, searchDrinks, servingLabelFor, type Drink, type DrinkCategory } from '../../data/alcohol';
type Tab = 'recent' | 'frequent' | 'favorite' | 'recipe' | 'drinks' | 'search';
const TABS: [Tab, string][] = [['search', 'Search'], ['recent', 'Recent'], ['frequent', 'Frequent'], ['favorite', 'Favorites'], ['recipe', 'Recipes'], ['drinks', 'Drinks']];
const drinkCandidate = (drink: Drink): Candidate => ({ name: drink.name, servingLabel: servingLabelFor(drink),
  macros: drinkMacros(drink), micros: drinkMicros(drink), source: 'custom', note: drinkNote(drink) });
type Candidate = { name: string; servingLabel: string | null; macros: SearchResult['macros']; micros: SearchResult['micros']; source: SavedFood['source']; note?: string };
export function FoodSearchModal({ onClose, meal }: { onClose: () => void; meal?: MealSlot }) {
  const owner = useAuthStore(s => s.session?.user.id) ?? 'anonymous';
  const [tab, setTab] = useState<Tab>('search');
  const [category, setCategory] = useState<DrinkCategory>('beer');
  const [term, setTerm] = useState(''); const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<SavedFood[]>(() => readSavedFoods(owner));
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>(() => readRecipes(owner));
  const [building, setBuilding] = useState<Recipe | 'new' | null>(null);
  useEffect(() => { const id = setTimeout(() => setQuery(term), 400); return () => clearTimeout(id); }, [term]);
  const results = useQuery({ enabled: tab === 'search' && query.trim().length >= 2, queryKey: ['food-search', query],
    queryFn: ({ signal }) => searchFoods(query, signal), retry: false, staleTime: 300000 });
  const list = useMemo(() => orderFoods(saved, tab === 'recent' || tab === 'frequent' || tab === 'favorite' ? tab : 'recent'), [saved, tab]);
  // The drinks catalogue is bundled, so it answers instantly and works with no connection.
  const drinkMatches = useMemo(() => tab === 'search' ? searchDrinks(term.trim()) : [], [tab, term]);
  if (chosen) return <PortionSheet candidate={chosen} meal={meal} owner={owner} onBack={() => setChosen(null)} onDone={onClose} />;
  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text className="mb-4 text-3xl font-bold">Add a food</Text>
        <View className="mb-3 flex-row flex-wrap">{TABS.map(([value, label]) => <Choice key={value} label={label} selected={tab === value} onPress={() => setTab(value)} />)}</View>
        {tab === 'search' && <>
          <Field label="Search foods & drinks" value={term} onChangeText={setTerm} autoCorrect={false} placeholder="Greek yogurt, chicken breast, Tito's, Bud Light…" />
          {!!drinkMatches.length && <>
            <Text className="mb-2 text-sm font-bold tracking-widest">DRINKS</Text>
            {drinkMatches.map(drink => <Row key={`drink:${drink.name}`} title={drink.name}
              subtitle={`${drinkMacros(drink).caloriesKcal} kcal · ${servingLabelFor(drink)}`}
              onPress={() => setChosen(drinkCandidate(drink))} />)}
            <Text className="mb-4 mt-1 text-xs">Drink energy is calculated from ABV and published carbohydrate, not read off a label.</Text>
          </>}
          {results.isPending && query.trim().length >= 2 && <LoadingCards label="Searching…" />}
          {results.isError && <Text accessibilityRole="alert" className="mb-3">Food search is unavailable right now. Try again, or add the food by hand.</Text>}
          {results.data?.length === 0 && !drinkMatches.length && <Text className="mb-3">Nothing matched “{query}”. Try fewer words, or scan the barcode instead.</Text>}
          {!!results.data?.length && <Text className="mb-2 text-sm font-bold tracking-widest">PACKAGED FOODS</Text>}
          {results.data?.map(result => <Row key={result.key} title={result.name} subtitle={`${result.brand ? `${result.brand} · ` : ''}${Math.round(result.macros.caloriesKcal)} kcal per ${result.servingLabel}`}
            onPress={() => setChosen({ name: result.name, servingLabel: result.servingLabel, macros: result.macros, micros: result.micros, source: 'custom' })} />)}
        </>}
        {tab === 'recipe' && <>
          {!recipes.length && <Text className="mb-4">No recipes yet. Build one from foods you have already logged and it becomes a single tap.</Text>}
          {recipes.map(recipe => { const single = perServing(recipe); return <Row key={recipe.id} title={recipe.name}
            subtitle={`${Math.round(single.macros.caloriesKcal)} kcal per serving · makes ${recipe.yieldServings} · ${recipe.items.length} ingredients`}
            onRemove={() => { setRecipes(deleteRecipe(owner, recipe.id)); haptic('warning'); }}
            onPress={() => setChosen({ name: recipe.name, servingLabel: 'serving', macros: single.macros, micros: single.micros, source: 'recipe' })} />; })}
          <Action secondary label="Create a recipe" onPress={() => setBuilding('new')} />
        </>}
        {tab === 'drinks' && <>
          <Text className="mb-3">Beer, wine, spirits and the rest, with the alcohol counted. Energy is calculated from ABV — a label always wins over this estimate.</Text>
          <View className="mb-3 flex-row flex-wrap">{DRINK_CATEGORIES.map(([value, label]) => <Choice key={value} label={label}
            selected={category === value} onPress={() => setCategory(value)} />)}</View>
          {drinksInCategory(category).map(drink => <Row key={drink.name} title={drink.name}
            subtitle={`${drinkMacros(drink).caloriesKcal} kcal · ${servingLabelFor(drink)}`}
            onPress={() => setChosen(drinkCandidate(drink))} />)}
        </>}
        {(tab === 'recent' || tab === 'frequent' || tab === 'favorite') && <>
          {!list.length && <Text className="mb-4">{tab === 'favorite' ? 'No favourites yet. Star a food after logging it and it lands here.' : 'Nothing logged yet. Foods you log appear here so the second time is one tap.'}</Text>}
          {list.map(food => <Row key={food.key} title={food.name}
            subtitle={`${Math.round(food.macros.caloriesKcal)} kcal${food.servingLabel ? ` per ${food.servingLabel}` : ''} · logged ${food.uses}×`}
            starred={food.favorite}
            onStar={() => { setSaved(toggleFavorite(owner, food.key)); haptic('selection'); }}
            onRemove={() => { setSaved(forgetFood(owner, food.key)); haptic('warning'); }}
            onPress={() => setChosen({ name: food.name, servingLabel: food.servingLabel, macros: food.macros, micros: food.micros, source: food.source })} />)}
        </>}
        <Action secondary label="Close" onPress={onClose} />
        {building && <RecipeBuilder owner={owner} existing={building === 'new' ? undefined : building}
          onClose={() => setBuilding(null)} onSaved={setRecipes} />}
      </ScrollView>
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
      haptic('success'); onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the portion and try again.'); }
  };
  return <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={onBack}>
    <SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text className="mb-1 text-3xl font-bold">{candidate.name}</Text>
        <Text className="mb-2 text-sm">{candidate.servingLabel ? `Per ${candidate.servingLabel}` : 'Per serving'} · {Math.round(candidate.macros.caloriesKcal)} kcal</Text>
        {!!candidate.note && <Text className="mb-4 text-sm">{candidate.note}</Text>}
        <Field label="Servings" value={servings} onChangeText={setServings} keyboardType="decimal-pad" />
        <View className="mb-4 flex-row flex-wrap">{[0.5, 1, 1.5, 2, 3].map(value => <Choice key={value} label={`${value}×`} selected={amount === value} onPress={() => setServings(String(value))} />)}</View>
        {preview && <View className="mb-5 rounded-3xl bg-surface p-5">
          <Text className="text-4xl font-bold">{Math.round(preview.caloriesKcal)} kcal</Text>
          <Text className="mt-2">Protein {Math.round(preview.proteinG)} g · Carbs {Math.round(preview.carbsG)} g · Fat {Math.round(preview.fatG)} g</Text>
        </View>}
        <Text className="mb-2 font-bold">Meal</Text>
        <View className="mb-4 flex-row flex-wrap">{MEAL_SLOTS.map(value => <Choice key={value} label={MEAL_LABELS[value]} selected={slot === value} onPress={() => setSlot(value)} />)}</View>
        {error && <Text accessibilityRole="alert" className="mb-4">{error}</Text>}
        <Action label="Log this food" onPress={log} tone="success" />
        <Action secondary label="Back to list" onPress={onBack} />
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
