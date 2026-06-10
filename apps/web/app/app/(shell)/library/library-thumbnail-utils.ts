export function clampScrubRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function scrubRatioFromPointer(
  clientX: number,
  rect: Pick<DOMRect, 'left' | 'width'>
): number {
  if (rect.width <= 0) return 0;
  return clampScrubRatio((clientX - rect.left) / rect.width);
}

export function formatLibraryScrubTime(
  totalMs: number | null,
  ratio: number
): string {
  const totalSeconds = totalMs && totalMs > 0 ? Math.round(totalMs / 1000) : 0;
  const currentSeconds = Math.round(totalSeconds * clampScrubRatio(ratio));
  const minutes = Math.floor(currentSeconds / 60);
  const seconds = currentSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
