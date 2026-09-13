import { durableStorage } from '../sync/storage';

export interface ProgressPhoto { id: string; uri: string; takenAtMs: number; weightLbs: number | null }
export interface PhotoDay { date: string; photos: ProgressPhoto[] }

export const MAX_PHOTOS_PER_DAY = 6;
const key = (owner: string) => `progress-photos:${owner}`;

function isPhoto(value: unknown): value is ProgressPhoto {
  const photo = value as ProgressPhoto | null;
  return !!photo && typeof photo.id === 'string' && typeof photo.uri === 'string' && !!photo.uri
    && typeof photo.takenAtMs === 'number' && Number.isFinite(photo.takenAtMs)
    && (photo.weightLbs === null || (typeof photo.weightLbs === 'number' && Number.isFinite(photo.weightLbs)));
}

/** Photos never leave the device: the manifest holds local file URIs, not image bytes. */
export function readPhotoDays(owner: string): PhotoDay[] {
  try {
    const raw = durableStorage.get(key(owner));
    const value = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(value)) return [];
    return value
      .filter((day: PhotoDay) => day && typeof day.date === 'string' && Array.isArray(day.photos))
      .map((day: PhotoDay) => ({ date: day.date, photos: day.photos.filter(isPhoto) }))
      .filter(day => day.photos.length)
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch { return []; }
}
function write(owner: string, days: PhotoDay[]) {
  try { durableStorage.set(key(owner), JSON.stringify(days)); } catch { /* a full disk must not block a weigh-in */ }
}

export function addPhotos(owner: string, date: string, photos: readonly ProgressPhoto[]): PhotoDay[] {
  const days = readPhotoDays(owner);
  const existing = days.find(day => day.date === date);
  const merged = [...(existing?.photos ?? []), ...photos.filter(isPhoto)].slice(0, MAX_PHOTOS_PER_DAY);
  const next = [{ date, photos: merged }, ...days.filter(day => day.date !== date)]
    .filter(day => day.photos.length)
    .sort((a, b) => b.date.localeCompare(a.date));
  write(owner, next);
  return next;
}
export function removePhoto(owner: string, date: string, id: string): PhotoDay[] {
  const next = readPhotoDays(owner)
    .map(day => day.date === date ? { ...day, photos: day.photos.filter(photo => photo.id !== id) } : day)
    .filter(day => day.photos.length);
  write(owner, next);
  return next;
}
export const photosForDate = (days: readonly PhotoDay[], date: string) =>
  days.find(day => day.date === date)?.photos ?? [];

export interface PhotoComparison { first: ProgressPhoto; latest: ProgressPhoto; days: number; weightChangeLbs: number | null }
/** The oldest and newest photo that both carry a weight, which is what "growth" means here. */
export function comparison(days: readonly PhotoDay[]): PhotoComparison | null {
  const all = [...days].flatMap(day => day.photos).sort((a, b) => a.takenAtMs - b.takenAtMs);
  if (all.length < 2) return null;
  const first = all[0]; const latest = all[all.length - 1];
  const change = first.weightLbs !== null && latest.weightLbs !== null ? latest.weightLbs - first.weightLbs : null;
  return { first, latest, days: Math.round((latest.takenAtMs - first.takenAtMs) / 86_400_000), weightChangeLbs: change };
}

/** Copies a camera capture out of the cache, which the OS is free to clear at any time. */
export async function persistCapture(uri: string, id: string): Promise<string> {
  const { File, Directory, Paths } = await import('expo-file-system');
  const folder = new Directory(Paths.document, 'progress-photos');
  if (!folder.exists) folder.create({ intermediates: true });
  const destination = new File(folder, `${id}.jpg`);
  if (destination.exists) destination.delete();
  new File(uri).copy(destination);
  return destination.uri;
}
export async function deleteCapture(uri: string) {
  try {
    const { File } = await import('expo-file-system');
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch { /* the manifest entry is gone either way */ }
}
