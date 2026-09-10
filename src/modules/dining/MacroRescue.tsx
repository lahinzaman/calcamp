import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { Text } from '../../theme/primitives';
import * as Location from 'expo-location';
import { readRescuePrefetch } from '../background/rescuePrefetch';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Action, Choice } from '../../components/FormControls';
import { useNutritionStore, nutritionStore } from '../../store/nutritionStore';
import { useAuthStore } from '../../store/authStore';
import { fetchMacroRescue } from '../../api/campus';
import { EASTON_AVE, fitsMacros, remainingMacros, rescueEligible, type Coordinates, type MacroPreference } from '../../types/rescue';
export default function MacroRescue() {
  const queryClient = useQueryClient();
  const prefetchedAt = useRef(0);
  const targets = useNutritionStore(s => s.dailyTargets); const consumed = useNutritionStore(s => s.consumedMacros);
  const user = useAuthStore(s => s.session?.user.id);
  const [now, setNow] = useState(() => new Date()); const [mode, setMode] = useState<'live' | 'easton'>('live');
  const [location, setLocation] = useState<Coordinates | null>(null); const [preference, setPreference] = useState<MacroPreference>('protein');
  const [error, setError] = useState<string | null>(null); const [locating, setLocating] = useState(false);
  const [requested, setRequested] = useState(false);
  const locationGeneration = useRef(0);
  useEffect(() => () => { locationGeneration.current++; }, []);
  const remaining = targets ? remainingMacros(targets.macros, consumed) : null;
  const enabled = !!user && rescueEligible(remaining, now);
  useEffect(() => {
    const tick = () => { nutritionStore.getState().syncToday(); setNow(new Date()); };
    const timer = setInterval(tick, 30_000); const listener = AppState.addEventListener('change', s => { if (s === 'active') tick(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, []);
  useEffect(() => {
    if (!user || !enabled || !remaining || requested || preference !== 'protein') return;
    const cached = readRescuePrefetch(user, remaining);
    if (!cached || cached.at === prefetchedAt.current) return;
    prefetchedAt.current = cached.at;
    queryClient.setQueryData(['macro-rescue', user, cached.location, remaining, 'protein'], cached.result, { updatedAt: cached.at });
    setLocation(cached.location); setRequested(true);
  }, [user, enabled, remaining, requested, preference, queryClient]);
  const search = useQuery({ queryKey: ['macro-rescue', user, location, remaining, preference],
    queryFn: ({ signal }) => fetchMacroRescue(location!, remaining!, preference, signal), enabled: enabled && requested && !!location,
    staleTime: 60_000, gcTime: 0, retry: false });
  const locate = async () => {
    if (!enabled || locating) return;
    setError(null); setLocating(true); const generation = ++locationGeneration.current;
    try {
      if (mode === 'easton') setLocation(EASTON_AVE);
      else {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error('Allow location access or choose Easton Ave.');
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (generation !== locationGeneration.current) return;
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      }
      setRequested(true);
    } catch (cause) { if (generation === locationGeneration.current) setError(cause instanceof Error ? cause.message : 'Location unavailable.'); }
    finally { if (generation === locationGeneration.current) setLocating(false); }
  };
  const switchLocation = (next: 'live' | 'easton') => { locationGeneration.current++; setLocating(false); setMode(next); setRequested(false); setLocation(null); setError(null); };
  return <View className="my-5 rounded-3xl border border-border bg-surface p-5">
    <Text className="text-xl font-bold text-ink">Late-night macro rescue</Text>
    {!enabled ? <Text className="mt-2 text-ink">Available 10 PM–midnight Eastern when your daily targets have more than 400 kcal remaining.</Text> : <>
      <Text className="my-3 text-ink">{Math.round(remaining!.caloriesKcal)} kcal left · P {Math.round(remaining!.proteinG)} · C {Math.round(remaining!.carbsG)} · F {Math.round(remaining!.fatG)} g</Text>
      <View className="flex-row flex-wrap"><Choice label="Live GPS (including Millburn)" selected={mode === 'live'} onPress={() => switchLocation('live')} /><Choice label="Easton Ave, New Brunswick" selected={mode === 'easton'} onPress={() => switchLocation('easton')} /></View>
      <View className="my-2 flex-row flex-wrap"><Choice label="High protein · 20 g+" selected={preference === 'protein'} onPress={() => setPreference('protein')} /><Choice label="Carb-focused · 30 g+" selected={preference === 'carbs'} onPress={() => setPreference('carbs')} /></View>
      <Action label={locating ? 'Getting location…' : search.isFetching ? 'Finding open restaurants…' : 'Find meals that fit'} disabled={locating || search.isFetching} onPress={() => { if (requested && location) void search.refetch(); else void locate(); }} />
      {location && <Text className="mb-3 text-xs text-ink">Searching within 1.55 mi of {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</Text>}
      {(error || search.error) && <Text accessibilityRole="alert" className="mb-3 text-ink">{error ?? search.error?.message}</Text>}
      {requested && search.data && <>
        <Text className="mb-3 text-xs font-semibold text-ink">Google Maps · Open when checked {new Date(search.data.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · 4★+ · 20+ reviews</Text>
        {search.data.matches.filter(match => fitsMacros(match.meal.macros, remaining!, preference)).map(match => <View key={`${match.placeId}/${match.meal.id}`} className="mb-3 rounded-xl bg-background p-4">
          <Text className="font-bold text-ink">{match.restaurant} · {match.rating}★</Text><Text className="mt-1 text-sm text-ink">{match.address}</Text>
          <Text className="my-2 font-semibold text-ink">{match.meal.name}</Text><Text className="mb-3 text-ink">{match.meal.macros.caloriesKcal} kcal · P {match.meal.macros.proteinG} · C {match.meal.macros.carbsG} · F {match.meal.macros.fatG} g</Text>
          <Action secondary label="Restaurant on Google Maps" onPress={() => { void Linking.openURL(match.mapsUrl); }} />
          <Action secondary label="Published nutrition source" onPress={() => { void Linking.openURL(match.meal.sourceUrl); }} />
          {match.attributions.map((a, i) => <Text key={i} className="text-xs text-ink">{a.provider}</Text>)}
        </View>)}
        {search.data.matches.length === 0 && <Text className="mb-3 text-ink">No verified meals fit all four remaining targets among the nearby open, highly-rated restaurants.</Text>}
        <Text className="text-xs text-ink">Published standard portions; actual portions and item availability vary. Nutrition coverage currently includes selected Chipotle bowls. {search.data.uncoveredRestaurants} eligible restaurant(s) excluded because verified nutrition is unavailable. Check the restaurant before ordering.</Text>
      </>}
    </>}
  </View>;
}
