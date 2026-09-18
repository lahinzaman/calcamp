import type { SessionExercise, WorkoutSet } from '../../types/workout';

/**
 * Two or three exercises done back to back with no rest between them. The point of pairing is
 * that the rest comes *after* the group, so the machinery is mostly about not starting a timer
 * in the middle of one — and about sending you to the next exercise instead of the next set.
 *
 * A group is just a shared ID on the exercises; the order of the sequence is the order you do
 * them in. That keeps reordering, removing and replacing an exercise working exactly as before.
 */
export const SUPERSET_LIMIT = 4;
export const supersetLabel = (index: number) => String.fromCharCode(65 + index);

/** The exercises in the same group as this one, in sequence order. Always at least itself. */
export function groupOf(sequence: readonly SessionExercise[], sessionExerciseId: string): SessionExercise[] {
  const entry = sequence.find(item => item.id === sessionExerciseId);
  if (!entry) return [];
  if (!entry.supersetId) return [entry];
  return sequence.filter(item => item.supersetId === entry.supersetId);
}

/** Every distinct group in the session, in the order their first exercise appears. */
export function groups(sequence: readonly SessionExercise[]): { id: string; members: SessionExercise[] }[] {
  const seen = new Map<string, SessionExercise[]>();
  for (const entry of sequence) {
    if (!entry.supersetId) continue;
    seen.set(entry.supersetId, [...(seen.get(entry.supersetId) ?? []), entry]);
  }
  return [...seen].map(([id, members]) => ({ id, members }));
}

/**
 * Where to go after completing a set. Inside a superset you move to the next exercise in the
 * group that still has work left — that *is* the superset. Only when the round is finished does
 * the answer become "rest, then come back", which is what `restsAfter` decides.
 */
export function nextAfterSet(sequence: readonly SessionExercise[], sets: readonly WorkoutSet[], completedSetId: string): string | null {
  const done = sets.find(set => set.id === completedSetId);
  if (!done) return null;
  const group = groupOf(sequence, done.sessionExerciseId);
  if (group.length < 2) return null;
  const at = group.findIndex(entry => entry.id === done.sessionExerciseId);
  const remaining = (id: string) => sets.some(set => set.sessionExerciseId === id && set.completedAtMs === null);
  // Walk the rest of the round, then wrap, so a partner you skipped is not stranded.
  for (let step = 1; step < group.length; step++) {
    const candidate = group[(at + step) % group.length];
    if (remaining(candidate.id)) return candidate.id;
  }
  return null;
}

/**
 * Whether finishing this set should start the rest timer. Resting between the halves of a
 * superset would make it two straight exercises with extra steps.
 */
export function restsAfter(sequence: readonly SessionExercise[], sets: readonly WorkoutSet[], completedSetId: string): boolean {
  return nextAfterSet(sequence, sets, completedSetId) === null;
}

/** Group these exercises together. Any of them already in a group leaves it for this one. */
export function assignSuperset(sequence: readonly SessionExercise[], ids: readonly string[], supersetId: string): SessionExercise[] {
  const wanted = new Set(ids);
  if (wanted.size < 2) throw new Error('A superset needs at least two exercises.');
  if (wanted.size > SUPERSET_LIMIT) throw new Error(`A superset holds at most ${SUPERSET_LIMIT} exercises.`);
  if ([...wanted].some(id => !sequence.some(entry => entry.id === id))) throw new Error('Unknown exercise instance.');
  return prune(sequence.map(entry => wanted.has(entry.id)
    ? { ...entry, supersetId }
    : entry.supersetId === supersetId ? strip(entry) : entry));
}

export function clearSuperset(sequence: readonly SessionExercise[], supersetId: string): SessionExercise[] {
  return sequence.map(entry => entry.supersetId === supersetId ? strip(entry) : entry);
}

const strip = (entry: SessionExercise) => { const { supersetId: _gone, ...rest } = entry; return rest; };
/**
 * A group of one is not a superset. Removing or replacing an exercise can leave a partner on
 * its own, and a lone member would otherwise keep suppressing its own rest timer forever.
 */
export function prune(sequence: readonly SessionExercise[]): SessionExercise[] {
  const counts = new Map<string, number>();
  for (const entry of sequence) if (entry.supersetId) counts.set(entry.supersetId, (counts.get(entry.supersetId) ?? 0) + 1);
  return sequence.map(entry => entry.supersetId && counts.get(entry.supersetId)! < 2 ? strip(entry) : entry);
}
