export const FEEDBACK_CATEGORIES = ['bug', 'feature', 'other'] as const;
export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number];
export interface FeedbackInput { id: string; category: FeedbackCategory; message: string; context: Record<string, string> }
export function validateFeedback(input: FeedbackInput) {
  if (!FEEDBACK_CATEGORIES.includes(input.category) || input.message.trim().length < 10 || input.message.trim().length > 4000) throw new Error('Write between 10 and 4,000 characters.');
  return { ...input, message: input.message.trim() };
}
