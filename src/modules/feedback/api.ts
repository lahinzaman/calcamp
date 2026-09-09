import { getSupabase } from '../../api/supabase';
import { validateFeedback, type FeedbackInput } from './model';
export async function submitFeedback(owner: string, input: FeedbackInput) {
  const value = validateFeedback(input);
  const { error } = await getSupabase().rpc('submit_feedback', { p_owner: owner, p_id: value.id, p_category: value.category, p_message: value.message, p_context: value.context });
  if (error) throw new Error(error.code === 'P0001' ? 'You can send up to five reports per day. Please try tomorrow.' : 'Report not confirmed. Check your connection and retry; your draft is still here.');
}
