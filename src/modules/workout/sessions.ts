import { durableStorage } from '../sync/storage';
import { dateKeyOf, detectRecords, recordWorkout, sessionVolume, type LiftHistory, type PersonalRecord, type SessionVolumePoint } from './history';
import type { CompletedWorkout } from '../../types/workout';

/**
 * Finished sessions, kept so they can be reopened and corrected. Deliberately *not* in
 * `AccountData`: that blob is re-serialised on every workout-store change — including each
 * keystroke in a set field — and a couple of years of sessions in it would make typing a weight
 * stringify half a megabyte. This key is written only when a session finishes or is edited.
 */
const KEY = (owner: string) => `workout-sessions:${owner}`;
/** Roughly two years at two sessions a week. Older ones survive as `baseline`, below. */
export const SESSION_LIMIT = 200;

export interface SessionArchive {
  /**
   * Lift history for everything no longer held as a session: the totals a user already had
   * when this feature arrived, plus sessions since evicted. Rebuilding after an edit folds the
   * retained sessions onto this, so an edit cannot erase a personal best from 2024.
   */
  baseline: LiftHistory;
  sessions: CompletedWorkout[];
}
const empty = (): SessionArchive => ({ baseline: {}, sessions: [] });

export function readArchive(owner: string): SessionArchive {
  try {
    const raw = durableStorage.get(KEY(owner));
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<SessionArchive>;
    if (!Array.isArray(parsed.sessions)) return empty();
    return { baseline: parsed.baseline ?? {}, sessions: parsed.sessions };
  } catch { return empty(); }
}
export function writeArchive(owner: string, archive: SessionArchive) {
  durableStorage.set(KEY(owner), JSON.stringify(archive));
}
export const findSession = (archive: SessionArchive, sessionId: string) =>
  archive.sessions.find(entry => entry.session.id === sessionId);

/** Newest first, which is the order anyone looks for a session they just finished. */
export const byNewest = (sessions: readonly CompletedWorkout[]) =>
  [...sessions].sort((a, b) => b.endedAtMs - a.endedAtMs);

/**
 * Adds a session to the window, evicting the oldest into `baseline` so nothing is simply
 * forgotten. `existingLifts` seeds the baseline the first time an account stores a session:
 * everything it had done up to that point is history we cannot rebuild from sessions we never
 * kept, so it becomes the floor that rebuilding starts from.
 */
export function archiveSession(archive: SessionArchive, workout: CompletedWorkout, existingLifts: LiftHistory = {}): SessionArchive {
  const seeded = archive.sessions.length === 0 && Object.keys(archive.baseline).length === 0
    ? { ...archive, baseline: existingLifts } : archive;
  if (seeded.sessions.some(entry => entry.session.id === workout.session.id)) return seeded;
  const sessions = byNewest([...seeded.sessions, workout]);
  let baseline = seeded.baseline;
  // Already newest-first, so reversing the overflow gives the oldest first. Chronological order
  // matters here: `lastSets` is overwritten by each fold, not merged.
  for (const evicted of sessions.slice(SESSION_LIMIT).reverse()) baseline = recordWorkout(baseline, evicted);
  return { baseline, sessions: sessions.slice(0, SESSION_LIMIT) };
}

export function replaceSession(archive: SessionArchive, workout: CompletedWorkout): SessionArchive {
  return { ...archive, sessions: byNewest(archive.sessions.map(entry => entry.session.id === workout.session.id ? workout : entry)) };
}
export function removeSession(archive: SessionArchive, sessionId: string): SessionArchive {
  return { ...archive, sessions: archive.sessions.filter(entry => entry.session.id !== sessionId) };
}

export interface RebuiltHistory { lifts: LiftHistory; volumeLog: SessionVolumePoint[]; lastRecords: PersonalRecord[] }
/**
 * Derives lift history from the archive after an edit. Bests are maxima, so they cannot be
 * lowered in place — correcting a set you logged as 315 when it was 135 only takes effect if
 * the whole window is folded again from the baseline.
 *
 * `previousLog` keeps points that predate session IDs: those sessions are not in the window, so
 * dropping them would silently shorten the volume trend.
 */
export function rebuildHistory(archive: SessionArchive, previousLog: readonly SessionVolumePoint[] = []): RebuiltHistory {
  const chronological = [...archive.sessions].sort((a, b) => a.endedAtMs - b.endedAtMs);
  const known = new Set(archive.sessions.map(entry => entry.session.id));
  let lifts = archive.baseline;
  let lastRecords: PersonalRecord[] = [];
  const rebuiltPoints: SessionVolumePoint[] = [];
  for (const workout of chronological) {
    // PRs are judged against history as it stood before that session, exactly as they were live.
    lastRecords = detectRecords(lifts, workout);
    lifts = recordWorkout(lifts, workout);
    rebuiltPoints.push({ date: dateKeyOf(workout.endedAtMs), value: sessionVolume(workout), sessionId: workout.session.id });
  }
  const carried = previousLog.filter(point => !point.sessionId || !known.has(point.sessionId));
  return { lifts, lastRecords, volumeLog: [...carried, ...rebuiltPoints].slice(-120) };
}
