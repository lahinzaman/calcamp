import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hitTargets, isLogged, milestones, summarizeStreak } from '../habits/streaks';
const day = (log_date: string, calories_kcal: number | null) => ({ log_date, calories_kcal });

test('a streak survives an unlogged today but breaks on a missed yesterday', () => {
  const run = ['2026-09-08', '2026-09-09', '2026-09-10'].map(date => day(date, 2000));
  assert.equal(summarizeStreak(run, '2026-09-10').current, 3);
  // Today not logged yet: yesterday still anchors the streak.
  assert.equal(summarizeStreak(run, '2026-09-11').current, 3);
  // A full day missed ends it.
  assert.equal(summarizeStreak(run, '2026-09-12').current, 0);
});

test('gaps split the run, the longest is remembered, and empty days never count', () => {
  const days = [day('2026-09-01', 2000), day('2026-09-02', 2000), day('2026-09-03', 2000), day('2026-09-04', null), day('2026-09-05', 0), day('2026-09-06', 1800), day('2026-09-07', 1900)];
  const summary = summarizeStreak(days, '2026-09-07');
  assert.equal(summary.longest, 3);
  assert.equal(summary.current, 2);
  assert.equal(summary.loggedDays, 5);
  assert.equal(summary.lastLoggedDate, '2026-09-07');
  assert.equal(isLogged(day('x', 0)), false);
  assert.deepEqual(summarizeStreak([], '2026-09-07'), { current: 0, longest: 0, loggedDays: 0, lastLoggedDate: null });
});

test('milestones report partial progress and flip once reached', () => {
  const summary = summarizeStreak(Array.from({ length: 7 }, (_, i) => day(`2026-09-0${i + 1}`, 2000)), '2026-09-07');
  const items = milestones(summary, 12);
  assert.equal(items.find(m => m.id === 'week-streak')!.reached, true);
  assert.equal(items.find(m => m.id === 'month-streak')!.reached, false);
  assert.ok(Math.abs(items.find(m => m.id === 'month-streak')!.progress - 7 / 30) < 1e-9);
  assert.equal(items.find(m => m.id === 'ten-workouts')!.reached, true);
  assert.equal(items.find(m => m.id === 'fifty-workouts')!.progress, 12 / 50);
});

test('hitting targets needs calories in band and protein met, and is silent without targets', () => {
  const target = { caloriesKcal: 2000, proteinG: 150 };
  assert.equal(hitTargets({ caloriesKcal: 2000, proteinG: 150 }, target), true);
  assert.equal(hitTargets({ caloriesKcal: 1960, proteinG: 145 }, target), true);
  assert.equal(hitTargets({ caloriesKcal: 1500, proteinG: 150 }, target), false);
  assert.equal(hitTargets({ caloriesKcal: 2400, proteinG: 150 }, target), false);
  assert.equal(hitTargets({ caloriesKcal: 2000, proteinG: 80 }, target), false);
  assert.equal(hitTargets({ caloriesKcal: 2000, proteinG: 150 }, undefined), false);
});
