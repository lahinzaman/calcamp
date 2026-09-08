import { fitsMacros, type Coordinates, type MacroPreference, type RescueResponse } from '../src/types/rescue';
import type { MacroTotals } from '../src/types/nutrition';
import { rescueCatalog } from './data/rescueCatalog';
interface Place {
  id?: string; displayName?: { text?: string }; formattedAddress?: string; rating?: number;
  userRatingCount?: number; businessStatus?: string; currentOpeningHours?: { openNow?: boolean };
  googleMapsUri?: string; attributions?: { provider: string; providerUri?: string }[];
}
export function matchPlaces(places: Place[], remaining: MacroTotals, preference: MacroPreference, now = new Date()): RescueResponse {
  const eligible = places.filter(p => p.id && p.displayName?.text && p.businessStatus === 'OPERATIONAL'
    && p.currentOpeningHours?.openNow === true && typeof p.rating === 'number' && p.rating >= 4 && (p.userRatingCount ?? 0) >= 20);
  let uncoveredRestaurants = 0;
  const matches = eligible.flatMap(place => {
    const entry = rescueCatalog.find(c => c.restaurantNames.some(name => name.toLowerCase() === place.displayName!.text!.trim().toLowerCase()));
    if (!entry) { uncoveredRestaurants++; return []; }
    return entry.meals.filter(meal => fitsMacros(meal.macros, remaining, preference)).map(meal => ({
      placeId: place.id!, restaurant: place.displayName!.text!, address: place.formattedAddress ?? '', rating: place.rating!, reviewCount: place.userRatingCount!,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName!.text!)}&query_place_id=${encodeURIComponent(place.id!)}`,
      meal, attributions: (place.attributions ?? []).map(a => ({ provider: a.provider, uri: a.providerUri })),
    }));
  });
  const key = preference === 'protein' ? 'proteinG' : 'carbsG';
  matches.sort((a, b) => b.meal.macros[key] / b.meal.macros.caloriesKcal - a.meal.macros[key] / a.meal.macros.caloriesKcal);
  return { matches, eligibleRestaurants: eligible.length, uncoveredRestaurants, checkedAt: now.toISOString() };
}
export async function findRescueMeals(location: Coordinates, remaining: MacroTotals, preference: MacroPreference,
  options: { fetchImpl?: typeof fetch; key?: string; now?: Date } = {}): Promise<RescueResponse> {
  const key = options.key ?? process.env.GOOGLE_PLACES_API_KEY; if (!key) throw new Error('Restaurant search is not configured.');
  const response = await (options.fetchImpl ?? fetch)('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus,places.currentOpeningHours.openNow,places.attributions' },
    body: JSON.stringify({ includedTypes: ['restaurant'], maxResultCount: 20, rankPreference: 'DISTANCE',
      locationRestriction: { circle: { center: location, radius: 2500 } } }), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('Restaurant search is unavailable.');
  const data = await response.json() as { places?: Place[] };
  if (!data || (data.places !== undefined && !Array.isArray(data.places))) throw new Error('Invalid restaurant response.');
  return matchPlaces(data.places ?? [], remaining, preference, options.now);
}
