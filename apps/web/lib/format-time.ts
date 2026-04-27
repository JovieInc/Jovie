/**
 * Format seconds as `m:ss` (minutes optional `mm:ss` past 10 min) for
 * audio scrub timestamps. Mirrors the player vocabulary used across the
 * app — short, padded seconds, no leading zero on minutes.
 *
 * @example
 * formatTime(78)   // "1:18"
 * formatTime(213)  // "3:33"
 * formatTime(0)    // "0:00"
 */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
