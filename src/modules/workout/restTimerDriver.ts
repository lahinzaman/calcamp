/** Web / non-native preview: timestamps recover the correct count after throttling. */
export function startRestTicker(tick: () => void): () => void {
  const interval = setInterval(tick, 500);
  return () => clearInterval(interval);
}
