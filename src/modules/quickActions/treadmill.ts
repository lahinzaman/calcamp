import { metersToMiles } from '../../lib/units';

/**
 * Reads a treadmill console out of OCR text.
 *
 * A console is not a nutrition label: the numbers are large and well lit, but they are laid out
 * as a grid of unlabelled figures under small captions, the units differ by machine and country,
 * and the same word means different things in different places — "CAL" is usually total calories
 * but is sometimes a per-hour rate. So this is deliberately conservative in the same way the
 * label parser is: a figure has to be captioned to be taken, an implausible one is dropped, and
 * whatever it could not read stays missing for the person to fill in rather than being guessed.
 */
export interface TreadmillReading {
  distanceMeters: number | null;
  durationSeconds: number | null;
  calories: number | null;
  /** Miles per hour, whatever the console displayed. */
  speedMph: number | null;
  inclinePercent: number | null;
  /** Only when the console itself displayed a step count. Estimated steps are separate. */
  steps: number | null;
  /** Which fields came off the display, for telling the user what it actually read. */
  found: string[];
}

/** OCR confuses these inside numbers. Applied only to a captured figure, never to a caption. */
const digits = (raw: string) => raw
  .replace(/[oOQ]/g, '0').replace(/[lI|]/g, '1').replace(/[sS]/g, '5').replace(/[^\d.:]/g, '');

function amount(raw: string | undefined, max: number): number | null {
  if (!raw) return null;
  const cleaned = digits(raw).replace(/:/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;
  // A stray second dot is OCR noise on a seven-segment display, not a number.
  if ((cleaned.match(/\./g) ?? []).length > 1) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

/**
 * Consoles show elapsed time as MM:SS almost always and H:MM:SS on long sessions. A bare number
 * under a TIME caption is minutes. Nothing here can tell 1:30 meaning ninety seconds from 1:30
 * meaning an hour and a half, so the common reading wins: on a treadmill, MM:SS.
 */
export function parseDuration(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = digits(raw);
  const parts = cleaned.split(':').filter(part => part.length);
  if (!parts.length) return null;
  if (parts.length === 1) {
    const minutes = Number(parts[0]);
    return Number.isFinite(minutes) && minutes >= 0 && minutes <= 600 ? Math.round(minutes * 60) : null;
  }
  const numbers = parts.map(Number);
  if (numbers.some(value => !Number.isFinite(value) || value < 0)) return null;
  const [a, b, c] = numbers;
  const seconds = parts.length === 2 ? a * 60 + b : a * 3600 + b * 60 + (c ?? 0);
  // Sixty-one minutes on the seconds side is a misread, not an hour and a minute.
  if (parts.length >= 2 && b >= 60) return null;
  if (parts.length === 3 && (c ?? 0) >= 60) return null;
  return seconds > 0 && seconds <= 24 * 3600 ? seconds : null;
}

/**
 * The gap between a caption and its figure.
 *
 * ML Kit returns a console as captions and figures on separate lines — "DISTANCE\n2.15 MI" —
 * so a gap that refuses to cross a newline reads nothing at all. It crosses at most one, and
 * only over spacing and punctuation: letting it cross arbitrary characters means an empty field
 * silently adopts the next caption's number, which is worse than reading nothing.
 */
const GAP = '[ \\t:.=\\-]*\\n?[ \\t:.=\\-]*';
const FIGURE = '([\\d.oOQlIsS]+)';
const captioned = (caption: string, text: string, figure = FIGURE) =>
  new RegExp(`\\b(?:${caption})\\b${GAP}${figure}`, 'i').exec(text)?.[1];

const MILE_METERS = 1609.344;
/** A treadmill in miles reads 0.0–99.9; one in kilometres the same. Both are plausible. */
function distanceFrom(text: string): { meters: number; unit: 'mi' | 'km' } | null {
  // A unit printed beside the figure settles it, wherever on the display it appears.
  const asMiles = amount(/([\d.oOQlIsS]+)\s*(?:mi|miles?)\b/i.exec(text)?.[1], 200);
  if (asMiles !== null && asMiles > 0) return { meters: asMiles * MILE_METERS, unit: 'mi' };
  const asKm = amount(/([\d.oOQlIsS]+)\s*(?:km|kilomet(?:er|re)s?)\b/i.exec(text)?.[1], 300);
  if (asKm !== null && asKm > 0) return { meters: asKm * 1000, unit: 'km' };
  // An unlabelled figure under a DISTANCE caption. Treated as miles, which is what a US
  // treadmill shows and what this app's units are throughout.
  const value = amount(captioned('dist(?:ance)?', text), 200);
  return value !== null && value > 0 ? { meters: value * MILE_METERS, unit: 'mi' } : null;
}

export function parseTreadmillDisplay(text: string): TreadmillReading {
  const flat = text.replace(/\r/g, '\n');
  const found: string[] = [];
  const take = <T,>(label: string, value: T | null): T | null => {
    if (value !== null) found.push(label);
    return value;
  };

  const distance = distanceFrom(flat);
  const durationRaw = captioned('time|elapsed|duration', flat, '([\\d:oOQlIsS]+)')
    // A clock-shaped figure with no caption is the elapsed time on every console.
    ?? /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/.exec(flat)?.[1];
  // "CAL/HR" and "CALORIES PER HOUR" are a rate, not a total: reading one as a total would
  // add several hundred calories that were never burned.
  const rate = /\bcal(?:orie)?s?\s*(?:\/|per)\s*h(?:r|our)?\b/i.test(flat);
  const caloriesRaw = rate ? undefined : captioned('cal|cals|calorie|calories', flat);
  const speedRaw = captioned('speed|pace|mph', flat);
  const inclineRaw = captioned('incline|grade|elev|elevation', flat);
  const stepsRaw = captioned('steps?', flat, '([\\d.oOQlIsS,]+)')
    ?? /([\d.oOQlIsS,]+)\s*steps?\b/i.exec(flat)?.[1];

  return {
    distanceMeters: take('distance', distance?.meters ?? null),
    durationSeconds: take('duration', parseDuration(durationRaw)),
    calories: take('calories', amount(caloriesRaw, 5000)),
    speedMph: take('speed', amount(speedRaw, 30)),
    inclinePercent: take('incline', amount(inclineRaw, 40)),
    steps: take('steps', amount(stepsRaw?.replace(/,/g, ''), 200_000)),
    found,
  };
}

/**
 * Stride length from height, which is the only measurement this app already has.
 *
 * The 0.413 coefficient is the standard walking-stride fraction of height used in step-length
 * estimation. It is an approximation and is presented as one: a long-legged walker and a short
 * one covering the same ground do not take the same number of steps, and running strides are
 * longer than walking strides at the same height.
 */
export const STRIDE_FRACTION_OF_HEIGHT = 0.413;
export function strideMeters(heightInches: number | null): number {
  // 5'8" is the fallback when the profile has no height, so an estimate is still offered.
  const inches = heightInches !== null && Number.isFinite(heightInches) && heightInches >= 36 && heightInches <= 96
    ? heightInches : 68;
  return inches * 0.0254 * STRIDE_FRACTION_OF_HEIGHT;
}

export interface StepEstimate { steps: number; strideMeters: number; miles: number; measured: boolean }
/**
 * Steps for a treadmill session. The console's own count wins whenever it showed one; otherwise
 * distance is divided by an estimated stride. `measured` says which happened, so the UI can be
 * honest about it rather than presenting a derived figure as a reading.
 */
export function estimateSteps(reading: TreadmillReading, heightInches: number | null): StepEstimate | null {
  const stride = strideMeters(heightInches);
  if (reading.steps !== null && reading.steps > 0) {
    return {
      steps: Math.round(reading.steps), strideMeters: stride, measured: true,
      miles: reading.distanceMeters !== null ? metersToMiles(reading.distanceMeters) : 0,
    };
  }
  if (reading.distanceMeters === null || reading.distanceMeters <= 0) return null;
  const steps = Math.round(reading.distanceMeters / stride);
  return steps > 0 && steps <= 200_000
    ? { steps, strideMeters: stride, miles: metersToMiles(reading.distanceMeters), measured: false }
    : null;
}
