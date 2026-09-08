import { GYMS, type GymBaseline, type GymSlug } from '../src/types/facilities';
type Forecast = { analysis: { day_info: { day_int: number }; day_raw: number[] }[] };
export function normalizeForecast(raw: unknown): Forecast {
  const data = raw as Partial<Forecast> & { status?: string };
  if (!data || data.status !== 'OK' || !Array.isArray(data.analysis) || data.analysis.length !== 7) throw new Error('No complete forecast.');
  const seen = new Set<number>();
  for (const day of data.analysis) {
    const index = day?.day_info?.day_int;
    if (!Number.isInteger(index) || index < 0 || index > 6 || seen.has(index) || !Array.isArray(day.day_raw) || day.day_raw.length !== 24
      || day.day_raw.some(n => !Number.isFinite(n) || n < 0 || n > 100)) throw new Error('Invalid forecast.');
    seen.add(index);
  }
  return data as Forecast;
}
export function forecastAt(forecast: Forecast, now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour')!.value);
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.find(p => p.type === 'weekday')!.value);
  // BestTime's day starts at 06:00, not midnight.
  return forecast.analysis.find(d => d.day_info.day_int === (day + (hour < 6 ? 6 : 0)) % 7)!.day_raw[(hour + 18) % 24];
}
export function createBestTimeService(options: { fetchImpl?: typeof fetch; now?: () => Date; key?: () => string | undefined } = {}) {
  const fetcher = options.fetchImpl ?? fetch; const now = options.now ?? (() => new Date());
  const cache = new Map<GymSlug, { value: Forecast | null; until: number }>();
  const pending = new Map<GymSlug, Promise<Forecast | null>>();
  const read = async (gym: typeof GYMS[number]): Promise<Forecast | null> => {
    const existing = cache.get(gym.slug); if (existing && existing.until > now().getTime()) return existing.value;
    if (pending.has(gym.slug)) return pending.get(gym.slug)!;
    const request = (async () => {
      let value: Forecast | null = null;
      try {
        const key = options.key?.() ?? process.env.BESTTIME_API_KEY; if (!key) throw new Error('Not configured.');
        const url = new URL('https://besttime.app/api/v1/forecasts');
        url.search = new URLSearchParams({ api_key_private: key, venue_name: gym.name, venue_address: gym.address }).toString();
        const result = await fetcher(url, { method: 'POST', signal: AbortSignal.timeout(15_000) });
        if (!result.ok) throw new Error('Forecast unavailable.'); value = normalizeForecast(await result.json());
      } catch { /* Never leak provider URLs containing the private key. */ }
      cache.set(gym.slug, { value, until: now().getTime() + (value ? 24 * 3600_000 : 5 * 60_000) });
      return value;
    })();
    pending.set(gym.slug, request);
    try { return await request; } finally { pending.delete(gym.slug); }
  };
  return async (): Promise<GymBaseline[]> => Promise.all(GYMS.map(async gym => {
    const data = await read(gym); const time = now();
    return { slug: gym.slug, baseline: data ? forecastAt(data, time) : null, checkedAt: time.toISOString(), status: data ? 'available' : 'unavailable' };
  }));
}
