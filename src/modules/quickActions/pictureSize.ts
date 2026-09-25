/** The largest "WIDTHxHEIGHT" size whose long edge is at most 2,048 pixels; iOS's "High" preset
 *  (1920x1080) when the list only names presets; null when nothing fits. */
export function pickMealPictureSize(sizes: readonly string[]): string | null {
  let best: { size: string; pixels: number } | null = null;
  for (const size of sizes) {
    const match = /^(\d+)x(\d+)$/.exec(size);
    if (!match) continue;
    const width = Number(match[1]); const height = Number(match[2]);
    if (Math.max(width, height) > 2048) continue;
    if (!best || width * height > best.pixels) best = { size, pixels: width * height };
  }
  return best?.size ?? (sizes.includes('High') ? 'High' : null);
}
