import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateSteps, parseDuration, parseTreadmillDisplay, strideMeters } from '../quickActions/treadmill';

/** What ML Kit actually returns from a console: captions and figures on separate lines. */
const CONSOLE = `
TIME
32:15
DISTANCE
2.15 MI
CALORIES
248
SPEED
4.0
INCLINE
2.5
`;

test('a console reads as the session it shows', () => {
  const reading = parseTreadmillDisplay(CONSOLE);
  assert.equal(reading.durationSeconds, 32 * 60 + 15);
  assert.ok(Math.abs(reading.distanceMeters! - 2.15 * 1609.344) < 1);
  assert.equal(reading.calories, 248);
  assert.equal(reading.speedMph, 4);
  assert.equal(reading.inclinePercent, 2.5);
  assert.equal(reading.steps, null, 'this console does not show steps, and none are invented here');
  assert.deepEqual(reading.found.sort(), ['calories', 'distance', 'duration', 'incline', 'speed']);
});

test('kilometres are read as kilometres, and a bare distance as miles', () => {
  const metric = parseTreadmillDisplay('DISTANCE 5.00 KM\nTIME 28:40');
  assert.ok(Math.abs(metric.distanceMeters! - 5000) < 1);
  // A US console often prints the figure with no unit at all.
  const bare = parseTreadmillDisplay('DISTANCE\n1.50\nTIME\n20:00');
  assert.ok(Math.abs(bare.distanceMeters! - 1.5 * 1609.344) < 1);
  assert.equal(parseTreadmillDisplay('TIME 10:00').distanceMeters, null, 'no distance shown is no distance');
});

test('a calories-per-hour readout is a rate and is not banked as a total', () => {
  // Reading 720 CAL/HR as a total adds most of a day's deficit that was never burned.
  const rate = parseTreadmillDisplay('CAL/HR\n720\nTIME\n15:00\nDISTANCE 1.00 MI');
  assert.equal(rate.calories, null);
  assert.ok(!rate.found.includes('calories'));
  assert.equal(parseTreadmillDisplay('CALORIES PER HOUR 640').calories, null);
  // The plain total still reads.
  assert.equal(parseTreadmillDisplay('CALORIES 315').calories, 315);
});

test('elapsed time is read the way a treadmill writes it', () => {
  assert.equal(parseDuration('32:15'), 32 * 60 + 15);
  assert.equal(parseDuration('1:05:30'), 3600 + 5 * 60 + 30);
  assert.equal(parseDuration('45'), 45 * 60, 'a bare figure under TIME is minutes');
  // Nothing can distinguish 1:30 as ninety seconds from an hour and a half, so the reading
  // a treadmill actually means wins.
  assert.equal(parseDuration('1:30'), 90);
  assert.equal(parseDuration('12:75'), null, 'seventy-five seconds is a misread, not a time');
  assert.equal(parseDuration('99:99:99'), null);
  assert.equal(parseDuration(undefined), null);
  assert.equal(parseDuration('abc'), null);
});

test('seven-segment confusions are corrected in figures but never invented', () => {
  // O for 0 and l for 1 are what OCR does to a seven-segment display.
  const messy = parseTreadmillDisplay('DISTANCE 2.lO MI\nCALORIES 2O4\nTIME 3O:OO');
  assert.ok(Math.abs(messy.distanceMeters! - 2.10 * 1609.344) < 1);
  assert.equal(messy.calories, 204);
  assert.equal(messy.durationSeconds, 30 * 60);
  // A figure that cleans up to nonsense is dropped rather than forced into a number.
  assert.equal(parseTreadmillDisplay('CALORIES ...').calories, null);
  assert.equal(parseTreadmillDisplay('DISTANCE 1.2.3 MI').distanceMeters, null);
  // Implausible figures are refused: no treadmill session is 900 miles.
  assert.equal(parseTreadmillDisplay('DISTANCE 900 MI').distanceMeters, null);
  assert.equal(parseTreadmillDisplay('INCLINE 95').inclinePercent, null);
});

test('a console that counts steps is believed; otherwise they are derived from distance', () => {
  const counted = parseTreadmillDisplay('STEPS 4,210\nDISTANCE 2.00 MI\nTIME 30:00');
  assert.equal(counted.steps, 4210);
  const measured = estimateSteps(counted, 70)!;
  assert.deepEqual([measured.steps, measured.measured], [4210, true], 'the console beats any formula');

  const derived = estimateSteps(parseTreadmillDisplay('DISTANCE 2.00 MI\nTIME 30:00'), 70)!;
  assert.equal(derived.measured, false, 'and a derived figure says that it is derived');
  // 2 miles at a 70in × 0.413 stride is a shade under 4,400 steps.
  assert.ok(derived.steps > 4000 && derived.steps < 4800, `unexpected estimate ${derived.steps}`);
  assert.ok(Math.abs(derived.miles - 2) < 0.01);

  // A taller person covers the same ground in fewer steps.
  const tall = estimateSteps(parseTreadmillDisplay('DISTANCE 2.00 MI'), 78)!;
  assert.ok(tall.steps < derived.steps);
  // With no height on file an estimate is still offered, from an average build.
  assert.ok(estimateSteps(parseTreadmillDisplay('DISTANCE 2.00 MI'), null)!.steps > 0);
  assert.equal(strideMeters(null), strideMeters(68));
  assert.equal(strideMeters(3), strideMeters(68), 'a nonsensical height falls back rather than throwing');

  // Nothing to count and nothing to derive from is no estimate, not zero.
  assert.equal(estimateSteps(parseTreadmillDisplay('TIME 20:00'), 70), null);
});
