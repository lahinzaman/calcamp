import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  heightLabelFor, massLabel, readLength, readMass, readUnits, readWeight,
  showWeight, weightLabel, weightUnit, writeUnits,
} from '../settings/measurementUnits';
import { ageOn, birthDateProblem, effectiveAge, isValidBirthDate } from '../onboarding/birthDate';

test('the preference changes the display, and a typed number round-trips back to pounds', () => {
  assert.equal(weightLabel(180, 'imperial'), '180 lbs');
  assert.equal(weightLabel(180, 'metric'), '81.6 kg');
  assert.equal(weightUnit('metric'), 'kg');
  // What you type means what the unit says, and converts back to the stored pound value.
  assert.ok(Math.abs(readWeight(81.65, 'metric') - 180) < 0.05);
  assert.equal(readWeight(180, 'imperial'), 180);
  assert.ok(Math.abs(showWeight(readWeight(75, 'metric'), 'metric') - 75) < 0.05);
});

test('height is feet and inches in one system and a single number in the other', () => {
  assert.equal(heightLabelFor(71, 'imperial'), '5 ft 11 in');
  assert.equal(heightLabelFor(71, 'metric'), '180 cm');
  assert.ok(Math.abs(readLength(180, 'metric') - 70.87) < 0.01);
  assert.equal(readLength(71, 'imperial'), 71);
});

test('portions convert too, and the unit travels with the number', () => {
  assert.equal(massLabel(4, 'imperial'), '4 oz');
  assert.equal(massLabel(4, 'metric'), '113.4 g');
  assert.ok(Math.abs(readMass(113.4, 'metric') - 4) < 0.01);
});

test('an unset or nonsense preference falls back to imperial rather than throwing', () => {
  assert.equal(writeUnits('metric'), 'metric');
  assert.equal(readUnits(), 'metric');
  assert.equal(writeUnits('klingon' as never), 'imperial');
  assert.equal(readUnits(), 'imperial');
});

test('a date of birth gives an age that stays right as time passes', () => {
  assert.equal(ageOn('2004-06-15', new Date('2026-06-14T12:00:00')), 21);
  // The birthday itself is the day the age changes.
  assert.equal(ageOn('2004-06-15', new Date('2026-06-15T12:00:00')), 22);
  assert.equal(ageOn('2004-12-31', new Date('2026-01-01T12:00:00')), 21);
  assert.equal(ageOn('not-a-date', new Date()), null);
  assert.equal(isValidBirthDate('2026-02-30'), false, 'a date that does not exist is refused');
  assert.equal(isValidBirthDate('2004-6-15'), false);
});

test('an age typed by an older build still works until a date replaces it', () => {
  assert.equal(effectiveAge({ age: 30 }), 30);
  assert.equal(effectiveAge({ birthDate: '2004-06-15', age: 99 }, new Date('2026-09-12T12:00:00')), 22, 'the date wins');
  assert.equal(effectiveAge({}), null);
  assert.equal(effectiveAge(null), null);
});

test('the quiz refuses a birth date that is unparseable or outside the adult range', () => {
  assert.match(birthDateProblem('yesterday')!, /YYYY-MM-DD/);
  assert.match(birthDateProblem('2015-01-01')!, /18–100/);
  assert.equal(birthDateProblem('2004-06-15'), null);
});
