import assert from 'node:assert/strict';
import { test } from 'node:test';
import { archiveSession, byNewest, rebuildHistory, removeSession, replaceSession, SESSION_LIMIT, type SessionArchive } from '../workout/sessions';
import { recordWorkout } from '../workout/history';
import type { CompletedWorkout } from '../../types/workout';

const DAY = 86_400_000;
function session(id: string, endedAtMs: number, sets: { weightLbs: number; reps: number }[]): CompletedWorkout {
  return {
    session: { id, name: 'Upper A', startedAtMs: endedAtMs - 3_600_000 },
    endedAtMs,
    exercises: [{ id: `${id}-slot`, exercise: { id: 'bench', name: 'Bench Press' }, defaultRestSeconds: 120 }],
    sets: sets.map((set, index) => ({
      id: `${id}-set-${index}`, sessionExerciseId: `${id}-slot`, weightLbs: set.weightLbs, reps: set.reps,
      rpe: null, kind: 'normal' as const, durationSeconds: null, distanceMeters: null, restSeconds: 120, estimatedOneRepMaxLbs: set.weightLbs, completedAtMs: endedAtMs - 60_000,
    })),
  };
}
const empty = (): SessionArchive => ({ baseline: {}, sessions: [] });

test('correcting a set that was logged too heavy actually lowers the personal best', () => {
  let archive = empty();
  archive = archiveSession(archive, session('a', 10 * DAY, [{ weightLbs: 185, reps: 5 }]));
  archive = archiveSession(archive, session('b', 11 * DAY, [{ weightLbs: 315, reps: 5 }]));
  assert.equal(rebuildHistory(archive).lifts.bench.bestWeightLbs, 315);

  // A best is a maximum, so the live incremental history can never walk one back on its own —
  // this is the whole reason an edit folds the window again from the baseline.
  const stale = recordWorkout(rebuildHistory(archive).lifts, session('b', 11 * DAY, [{ weightLbs: 135, reps: 5 }]));
  assert.equal(stale.bench.bestWeightLbs, 315, 'folding the correction onto the old totals keeps the wrong number');

  archive = replaceSession(archive, session('b', 11 * DAY, [{ weightLbs: 135, reps: 5 }]));
  const rebuilt = rebuildHistory(archive);
  assert.equal(rebuilt.lifts.bench.bestWeightLbs, 185, 'rebuilding from the baseline drops it to the real best');
  assert.equal(rebuilt.lifts.bench.sessions, 2, 'an edit is not a second session');
  assert.deepEqual(rebuilt.lifts.bench.lastSets, [{ weightLbs: 135, reps: 5, durationSeconds: null, distanceMeters: null }],
    'and the previous column shows the correction');
});

test('a session that predates the archive still counts, and one evicted from it is not forgotten', () => {
  // An account that was already lifting when this arrived: its totals become the floor.
  const existing = recordWorkout({}, session('ancient', DAY, [{ weightLbs: 405, reps: 1 }]));
  let archive = archiveSession(empty(), session('a', 10 * DAY, [{ weightLbs: 185, reps: 5 }]), existing);
  assert.equal(rebuildHistory(archive).lifts.bench.bestWeightLbs, 405,
    'a personal best from before the first stored session survives a rebuild');

  for (let i = 0; i < SESSION_LIMIT + 5; i++) archive = archiveSession(archive, session(`s${i}`, (20 + i) * DAY, [{ weightLbs: 100 + i, reps: 5 }]));
  assert.equal(archive.sessions.length, SESSION_LIMIT, 'the window is bounded');
  assert.equal(archive.sessions[0].session.id, `s${SESSION_LIMIT + 4}`, 'newest first');
  assert.equal(rebuildHistory(archive).lifts.bench.bestWeightLbs, 405, 'and eviction folded into the baseline, not the bin');

  // Re-archiving the same session is a no-op, so a retried save cannot double-count it.
  const again = archiveSession(archive, archive.sessions[0]);
  assert.equal(again.sessions.length, SESSION_LIMIT);
  assert.equal(rebuildHistory(again).lifts.bench.sessions, rebuildHistory(archive).lifts.bench.sessions);
});

test('the volume trend follows an edit without discarding points it cannot identify', () => {
  let archive = archiveSession(empty(), session('a', 10 * DAY, [{ weightLbs: 100, reps: 10 }]));
  archive = archiveSession(archive, session('b', 11 * DAY, [{ weightLbs: 200, reps: 10 }]));
  // Points recorded before sessions carried an id belong to sessions we never kept.
  const older = [{ date: '2026-01-01', value: 5_000 }, { date: '2026-01-02', value: 6_000, sessionId: 'evicted' }];
  const first = rebuildHistory(archive, older);
  assert.deepEqual(first.volumeLog.map(p => p.value), [5_000, 6_000, 1_000, 2_000]);

  archive = replaceSession(archive, session('b', 11 * DAY, [{ weightLbs: 50, reps: 10 }]));
  const after = rebuildHistory(archive, first.volumeLog);
  assert.deepEqual(after.volumeLog.map(p => p.value), [5_000, 6_000, 1_000, 500],
    'the edited session replaces its own point and nothing else');

  const deleted = rebuildHistory(removeSession(archive, 'b'), after.volumeLog.filter(p => p.sessionId !== 'b'));
  assert.deepEqual(deleted.volumeLog.map(p => p.value), [5_000, 6_000, 1_000]);
  assert.equal(deleted.lifts.bench.bestWeightLbs, 100, 'deleting a session takes its best with it');
});

test('sessions read back newest first whatever order they went in', () => {
  const out = byNewest([session('a', 3 * DAY, []), session('b', DAY, []), session('c', 2 * DAY, [])]);
  assert.deepEqual(out.map(entry => entry.session.id), ['a', 'c', 'b']);
});
