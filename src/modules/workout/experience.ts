import { durableStorage } from '../sync/storage';
import { EXPERIENCE_LEVELS, type ExperienceLevel } from './volume';
const key = (owner: string) => `training-experience:${owner}`;
export function readExperience(owner: string): ExperienceLevel {
  const raw = durableStorage.get(key(owner));
  return (EXPERIENCE_LEVELS as readonly string[]).includes(raw ?? '') ? raw as ExperienceLevel : 'beginner';
}
export function writeExperience(owner: string, level: ExperienceLevel) {
  try { durableStorage.set(key(owner), level); } catch { /* a full disk must not block training */ }
}
