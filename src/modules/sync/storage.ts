export interface DurableStorage { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }
export function memoryStorage(): DurableStorage {
  const values = new Map<string, string>(); return { get: k => values.get(k) ?? null, set: (k, v) => { values.set(k, v); }, remove: k => { values.delete(k); } };
}
const server = memoryStorage();
export const durableStorage: DurableStorage = {
  get: key => typeof window === 'undefined' ? server.get(key) : window.localStorage.getItem(`rulocked:${key}`),
  set: (key, value) => { if (typeof window === 'undefined') server.set(key, value); else window.localStorage.setItem(`rulocked:${key}`, value); },
  remove: key => { if (typeof window === 'undefined') server.remove(key); else window.localStorage.removeItem(`rulocked:${key}`); },
};
