/**
 * Format seconds as `m:ss` (minutes optional `mm:ss` past 10 min) for
 * audio scrub timestamps. Returns `0:00` for NaN / Infinity / negative
 * input — `duration` starts as NaN in some audio element states before
 * metadata loads, so this path is reachable.
 *
 * @example
 * formatTime(78)   // "1:18"
 * formatTime(213)  // "3:33"
 * formatTime(NaN)  // "0:00"
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
