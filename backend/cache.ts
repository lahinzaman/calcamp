export interface CacheEntry<T> { value: T; savedAt: number; freshUntil: number; staleUntil: number }
/** Redis adapters implement GET/SET JSON and use staleUntil for EX/PX expiry. */
export interface ResponseCache { get<T>(key: string): Promise<CacheEntry<T> | null>; set<T>(key: string, entry: CacheEntry<T>): Promise<void> }
export class MemoryResponseCache implements ResponseCache {
  private entries = new Map<string, CacheEntry<unknown>>();
  constructor(private maxEntries = 256) {}
  async get<T>(key: string) { const value = this.entries.get(key); if (!value || value.staleUntil <= Date.now()) { this.entries.delete(key); return null; } return value as CacheEntry<T>; }
  async set<T>(key: string, value: CacheEntry<T>) { this.entries.delete(key); this.entries.set(key, value); while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!); }
}
export function cacheTtl() { const n = Number(process.env.CAMPUS_CACHE_TTL_SECONDS ?? 300); return Number.isFinite(n) && n >= 1 && n <= 3600 ? n * 1000 : 300_000; }
export function createCachedLoader(cache: ResponseCache = new MemoryResponseCache(), now = Date.now) {
  const pending = new Map<string, Promise<{ value: unknown; stale: boolean; savedAt: number }>>();
  const failures = new Map<string, number>();
  return async function cached<T>(key: string, loader: () => Promise<T>, ttl = cacheTtl(), staleMs = 3600_000) {
    const entry = await cache.get<T>(key).catch(() => null);
    if (entry && entry.freshUntil > now()) return { value: entry.value, stale: false, savedAt: entry.savedAt };
    if ((failures.get(key) ?? 0) > now()) {
      if (entry && entry.staleUntil > now()) return { value: entry.value, stale: true, savedAt: entry.savedAt };
      throw new Error('Upstream cooling down.');
    }
    if (pending.has(key)) return pending.get(key)! as Promise<{ value: T; stale: boolean; savedAt: number }>;
    const request = (async () => {
      try {
        const value = await loader(); const savedAt = now();
        await cache.set(key, { value, savedAt, freshUntil: savedAt + ttl, staleUntil: savedAt + ttl + staleMs }).catch(() => {});
        failures.delete(key); return { value, stale: false, savedAt };
      } catch (error) {
        failures.set(key, now() + 30_000);
        if (failures.size > 256) failures.delete(failures.keys().next().value!);
        if (entry && entry.staleUntil > now()) return { value: entry.value, stale: true, savedAt: entry.savedAt };
        throw error;
      }
    })();
    pending.set(key, request);
    try { return await request; } finally { pending.delete(key); }
  };
}
