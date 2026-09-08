export type Coordinate = [longitude: number, latitude: number];
export interface WalkingLoop {
  geometry: { type: 'LineString'; coordinates: Coordinate[] };
  distanceMeters: number;
  durationSeconds: number;
  targetMeters: number;
  differenceMeters: number;
  withinTolerance: boolean;
}
export const COLLEGE_AVE: Coordinate = [-74.4518, 40.5021];
export function stepDeficit(steps: number, goal = 10_000, metersPerStep = 0.75) {
  if (!Number.isInteger(steps) || steps < 0 || !Number.isInteger(goal) || goal <= 0
    || !Number.isFinite(metersPerStep) || metersPerStep < 0.3 || metersPerStep > 1.5) throw new Error('Enter valid steps, goal, and stride length.');
  const remainingSteps = Math.max(0, goal - steps);
  return { remainingSteps, distanceMeters: remainingSteps * metersPerStep };
}
function validCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 85;
}
function destination([lng, lat]: Coordinate, meters: number, bearing: number): Coordinate {
  const rad = Math.PI / 180, delta = meters / 6_371_000, theta = bearing * rad, phi = lat * rad;
  const nextLat = Math.asin(Math.sin(phi) * Math.cos(delta) + Math.cos(phi) * Math.sin(delta) * Math.cos(theta));
  const nextLng = lng * rad + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi), Math.cos(delta) - Math.sin(phi) * Math.sin(nextLat));
  return [((nextLng / rad + 540) % 360) - 180, nextLat / rad];
}
export function parseWalkingRoute(value: unknown, targetMeters: number): WalkingLoop | null {
  const response = value as { code?: unknown; routes?: unknown[] } | null;
  if (response?.code === 'NoRoute' || response?.code === 'NoSegment') return null;
  if (response?.code !== 'Ok' || !Array.isArray(response.routes)) throw new Error('Unexpected Mapbox response.');
  const route = response.routes[0] as { distance?: number; duration?: number; geometry?: WalkingLoop['geometry'] } | undefined;
  if (!route) return null;
  if (!Number.isFinite(route.distance) || route.distance! <= 0 || !Number.isFinite(route.duration) || route.duration! <= 0
    || route.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates)
    || route.geometry.coordinates.length < 3 || !route.geometry.coordinates.every(validCoordinate)) throw new Error('Mapbox returned an invalid walking route.');
  const [first, last] = [route.geometry.coordinates[0], route.geometry.coordinates.at(-1)!];
  if (Math.hypot((first[0] - last[0]) * Math.cos(first[1] * Math.PI / 180), first[1] - last[1]) * 111_320 > 50) return null;
  const differenceMeters = route.distance! - targetMeters;
  return { geometry: route.geometry, distanceMeters: route.distance!, durationSeconds: route.duration!,
    targetMeters, differenceMeters, withinTolerance: Math.abs(differenceMeters) <= Math.max(50, targetMeters * 0.1) };
}
/** Search three closed walking candidates and refine the closest; not global optimization. */
export async function generateWalkingLoop(start: Coordinate, targetMeters: number, options: {
  token: string; signal?: AbortSignal; fetchImpl?: typeof fetch;
}): Promise<WalkingLoop> {
  if (!validCoordinate(start) || !Number.isFinite(targetMeters) || targetMeters < 100 || targetMeters > 20_000) throw new Error('Loop distance must be between 100 m and 20 km.');
  if (!options.token.startsWith('pk.')) throw new Error('Configure a public Mapbox access token.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 20_000);
  const fetcher = options.fetchImpl ?? fetch;
  const candidate = async (bearing: number, radius: number) => {
    const coordinates = [start, destination(start, radius, bearing), destination(start, radius, bearing + 60), start];
    const path = coordinates.map(point => point.join(',')).join(';');
    const query = new URLSearchParams({ access_token: options.token, geometries: 'geojson', overview: 'full',
      steps: 'false', continue_straight: 'false', radiuses: '50;100;100;50' });
    const response = await fetcher(`https://api.mapbox.com/directions/v5/mapbox/walking/${path}?${query}`, { signal: controller.signal });
    if (!response.ok) throw new Error('Mapbox walking directions are unavailable.');
    return parseWalkingRoute(await response.json(), targetMeters);
  };
  try {
    const attempts = await Promise.allSettled([0, 120, 240].map(async bearing => ({ bearing, route: await candidate(bearing, targetMeters / 3) })));
    if (controller.signal.aborted) throw new Error('Walking route request was cancelled or timed out.');
    const available = attempts.flatMap(result => result.status === 'fulfilled' && result.value.route ? [result.value as { bearing: number; route: WalkingLoop }] : []);
    available.sort((a, b) => Math.abs(a.route.differenceMeters) - Math.abs(b.route.differenceMeters));
    if (!available.length) throw new Error('No walkable loop found near this start. Try another location.');
    const best = available[0];
    if (!best.route.withinTolerance) {
      try {
        const refined = await candidate(best.bearing, Math.min(8000, targetMeters / 3 * targetMeters / best.route.distanceMeters));
        if (refined && Math.abs(refined.differenceMeters) < Math.abs(best.route.differenceMeters)) best.route = refined;
      } catch { if (controller.signal.aborted) throw new Error('Walking route request was cancelled or timed out.'); }
    }
    return best.route;
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
