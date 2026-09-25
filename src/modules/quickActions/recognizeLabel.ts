import { Platform } from 'react-native';
import { parseNutritionLabel, type LabelReading, type OcrResult } from './nutritionLabel';

export class LabelUnavailable extends Error {
  constructor(message = 'Label scanning needs the iOS or Android app — this build cannot read text from a photo.') { super(message); }
}

/**
 * On-device text recognition. Nothing leaves the phone: ML Kit runs locally, which is why
 * this works with no backend and no API key, and why it is absent on web.
 *
 * The whole result is kept, not just its text: a nutrition panel is a table, and where each
 * line and word sat on the photo is what puts an amount back on its nutrient's row.
 */
export async function recognizeText(uri: string): Promise<OcrResult> {
  if (Platform.OS === 'web') throw new LabelUnavailable();
  try {
    const module = await import('@react-native-ml-kit/text-recognition');
    const recognizer = (module as { default?: { recognize(uri: string): Promise<OcrResult> } }).default ?? module;
    const result = await (recognizer as { recognize(uri: string): Promise<OcrResult> }).recognize(uri);
    return { text: typeof result?.text === 'string' ? result.text : '', blocks: Array.isArray(result?.blocks) ? result.blocks : [] };
  } catch (cause) {
    if (cause instanceof LabelUnavailable) throw cause;
    throw new LabelUnavailable('Text recognition is not available in this build. Rebuild the app after installing it, or enter the label by hand.');
  }
}

/**
 * The text in a photo, whatever it says. A nutrition panel and a treadmill console are the same
 * problem — characters on a photographed surface — so they share this and differ only in how
 * the result is read.
 */
export async function recognizeRawText(uri: string): Promise<string> {
  return (await recognizeText(uri)).text;
}

export async function recognizeLabel(uri: string): Promise<LabelReading> {
  return parseNutritionLabel(await recognizeText(uri));
}
