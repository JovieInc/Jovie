/**
 * Format a stream / view / play count as a human-readable string with
 * suffixes for thousands and millions. Returns `"0"` for NaN, Infinity, or
 * negative input — release counters can transiently emit those before the
 * data layer settles.
 *
 * @example
 * formatStreams(842)        // "842"
 * formatStreams(1234)       // "1.2K"
 * formatStreams(45_678)     // "45.7K"
 * formatStreams(1_234_567)  // "1.2M"
 */
export function formatStreams(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return Math.floor(n).toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
