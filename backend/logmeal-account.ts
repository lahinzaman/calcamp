/** Credentials remain server-side and each mapping belongs to exactly one app user. */
export function logMealTokenForUser(userId: string): string | undefined {
  const tokens = JSON.parse(process.env.LOGMEAL_USER_TOKENS_JSON ?? '{}') as Record<string, unknown>;
  if (typeof tokens[userId] === 'string') return tokens[userId];
  return userId === process.env.LOGMEAL_USER_ID ? process.env.LOGMEAL_API_KEY : undefined;
}
/** The user-delete endpoint only soft-deletes used accounts; remove intakes explicitly. */
export async function purgeLogMealHistory(userId: string, fetcher = fetch, token = logMealTokenForUser(userId)) {
  if (!token) return;
  const headers = { Authorization: `Bearer ${token}` };
  const deadline = AbortSignal.timeout(60000);
  const signal = () => AbortSignal.any([deadline, AbortSignal.timeout(15000)]);
  // Include the next day to cover provider-local dates ahead of UTC.
  const until = new Date(Date.now() + 86400000).toISOString().slice(0, 10).replaceAll('-', '/');
  const list = async () => {
    const query = new URLSearchParams({ date_from: '1970/01/01, 00:00:00', date_to: `${until}, 23:59:59` });
    const response = await fetcher(`https://api.logmeal.com/v2/history/getIntakesList?${query}`, { headers, signal: signal() });
    if (!response.ok) throw new Error('Provider history unavailable.');
    const data = await response.json();
    if (!Array.isArray(data.intakes_list)) throw new Error('Unrecognized provider history.');
    const ids = data.intakes_list.map((entry: { image_id?: unknown }) => entry.image_id);
    if (!ids.every((id: unknown) => Number.isSafeInteger(id) && Number(id) > 0)) throw new Error('Unrecognized provider intake.');
    return ids as number[];
  };
  // Bounded batches let interrupted deletions resume by retrying the same request.
  const ids = await list();
  for (const id of ids.slice(0, 50)) {
    const response = await fetcher(`https://api.logmeal.com/v2/intake/${id}`, { method: 'DELETE', headers, signal: signal() });
    if (!response.ok && response.status !== 404) throw new Error('Provider deletion unavailable.');
  }
  if ((await list()).length) throw new Error('Provider deletion still pending. Retry to continue.');
}
