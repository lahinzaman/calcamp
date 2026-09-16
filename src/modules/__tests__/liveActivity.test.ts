import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
mock.module('react-native', { namedExports: { Platform: { OS: 'ios', select: () => undefined } } });

const { activityTitle, activitySubtitle, activityProgress, startDay, updateDay, endDay, activeActivityId, resetActivityForTests } =
  require('../liveActivity/LiveActivityService') as typeof import('../liveActivity/LiveActivityService');

const day = (caloriesKcal: number, targetKcal: number | null) =>
  ({ consumed: { caloriesKcal, proteinG: 120.4, carbsG: 210.6, fatG: 60.2 }, targetKcal });
afterEach(() => resetActivityForTests());

test('the lock screen says what is left, and says something honest with no target', () => {
  assert.equal(activityTitle(day(1800, 2400)), '600 kcal left');
  assert.equal(activityTitle(day(2600, 2400)), '200 kcal over');
  // A ring with nothing to fill is not progress, so a profile with no target gets a total.
  assert.equal(activityTitle(day(1800, null)), '1,800 kcal logged');
  assert.equal(activityProgress(day(1800, null)), undefined);
  assert.equal(activitySubtitle(day(1800, 2400)), 'P 120 · C 211 · F 60');
});

test('the bar fills but never runs past its end', () => {
  assert.equal(activityProgress(day(1200, 2400)), 0.5);
  assert.equal(activityProgress(day(3600, 2400)), 1, 'over target stays full rather than overflowing');
  assert.equal(activityProgress(day(0, 2400)), 0);
  assert.equal(activityProgress(day(1200, 0)), undefined, 'a target of zero is no target');
});

test('a build without the widget extension does nothing rather than crashing', async () => {
  // ActivityKit needs iOS 16.1 and a build that bundled the extension. The app also runs on
  // Android, on the web and in Expo Go, and a lock-screen ornament is not worth a crash there.
  assert.equal(await startDay(day(500, 2000)), null);
  assert.equal(activeActivityId(), null);
  assert.equal(await updateDay(day(900, 2000)), null);
  await endDay(day(900, 2000));
  assert.equal(activeActivityId(), null, 'and nothing is left pinned behind it');
});
