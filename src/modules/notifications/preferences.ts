import { durableStorage } from '../sync/storage';
import { defaultPreferences, parsePreferences, type NotificationPreferences } from './policy';
export function readPreferences(owner: string): NotificationPreferences {
  try { const raw = durableStorage.get(`notifications:${owner}`); return raw ? parsePreferences(JSON.parse(raw)) : { ...defaultPreferences }; }
  catch { return { ...defaultPreferences }; }
}
export function savePreferences(owner: string, value: NotificationPreferences) { durableStorage.set(`notifications:${owner}`, JSON.stringify(parsePreferences(value))); }
