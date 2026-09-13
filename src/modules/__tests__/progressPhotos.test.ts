import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { MAX_PHOTOS_PER_DAY, addPhotos, comparison, photosForDate, readPhotoDays, removePhoto } from '../progress/photos';

const owner = 'alice';
const photo = (id: string, takenAtMs: number, weightLbs: number | null = 180) => ({ id, uri: `file:///${id}.jpg`, takenAtMs, weightLbs });
afterEach(() => { for (const day of readPhotoDays(owner)) for (const item of day.photos) removePhoto(owner, day.date, item.id); });

test('photos are grouped by day, newest day first', () => {
  addPhotos(owner, '2026-09-01', [photo('a', 1)]);
  addPhotos(owner, '2026-09-10', [photo('b', 2)]);
  assert.deepEqual(readPhotoDays(owner).map(day => day.date), ['2026-09-10', '2026-09-01']);
  assert.equal(photosForDate(readPhotoDays(owner), '2026-09-01').length, 1);
  assert.deepEqual(photosForDate(readPhotoDays(owner), '2026-01-01'), []);
});

test('several photos can be taken for one weigh-in, up to a sane ceiling', () => {
  addPhotos(owner, '2026-09-10', [photo('a', 1), photo('b', 2), photo('c', 3)]);
  assert.equal(photosForDate(readPhotoDays(owner), '2026-09-10').length, 3);
  addPhotos(owner, '2026-09-10', Array.from({ length: 10 }, (_, i) => photo(`x${i}`, 10 + i)));
  assert.equal(photosForDate(readPhotoDays(owner), '2026-09-10').length, MAX_PHOTOS_PER_DAY);
});

test('removing the last photo of a day removes the day', () => {
  addPhotos(owner, '2026-09-10', [photo('a', 1)]);
  assert.deepEqual(removePhoto(owner, '2026-09-10', 'a'), []);
  assert.deepEqual(readPhotoDays(owner), []);
});

test('a malformed manifest entry is dropped rather than crashing the card', () => {
  addPhotos(owner, '2026-09-10', [photo('a', 1), { id: 'b', uri: '', takenAtMs: 2, weightLbs: null },
    { id: 'c', uri: 'file:///c.jpg', takenAtMs: Number.NaN, weightLbs: null }] as never);
  assert.deepEqual(photosForDate(readPhotoDays(owner), '2026-09-10').map(item => item.id), ['a']);
});

test('the comparison spans the oldest and newest photo, and needs two of them', () => {
  addPhotos(owner, '2026-09-01', [photo('a', Date.parse('2026-09-01T09:00:00Z'), 200)]);
  assert.equal(comparison(readPhotoDays(owner)), null);
  addPhotos(owner, '2026-10-01', [photo('b', Date.parse('2026-10-01T09:00:00Z'), 190)]);
  const change = comparison(readPhotoDays(owner))!;
  assert.equal(change.first.id, 'a');
  assert.equal(change.latest.id, 'b');
  assert.equal(change.days, 30);
  assert.equal(change.weightChangeLbs, -10);
});

test('a photo taken without a weight still counts, it just has no change to report', () => {
  addPhotos(owner, '2026-09-01', [photo('a', 1, null)]);
  addPhotos(owner, '2026-09-02', [photo('b', 2, null)]);
  assert.equal(comparison(readPhotoDays(owner))!.weightChangeLbs, null);
});
