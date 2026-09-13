import { Platform } from 'react-native';
import { parseNutritionLabel, type LabelReading } from './nutritionLabel';

export class LabelUnavailable extends Error {
  constructor(message = 'Label scanning needs the iOS or Android app — this build cannot read text from a photo.') { super(message); }
}

/**
 * On-device text recognition. Nothing leaves the phone: ML Kit runs locally, which is why
 * this works with no backend and no API key, and why it is absent on web.
 */
export async function recognizeLabel(uri: string): Promise<LabelReading> {
  if (Platform.OS === 'web') throw new LabelUnavailable();
  let text: string;
  try {
    const module = await import('@react-native-ml-kit/text-recognition');
    const recognizer = (module as { default?: { recognize(uri: string): Promise<{ text: string }> } }).default ?? module;
    const result = await (recognizer as { recognize(uri: string): Promise<{ text: string }> }).recognize(uri);
    text = typeof result?.text === 'string' ? result.text : '';
  } catch (cause) {
    if (cause instanceof LabelUnavailable) throw cause;
    throw new LabelUnavailable('Text recognition is not available in this build. Rebuild the app after installing it, or enter the label by hand.');
  }
  return parseNutritionLabel(text);
}
