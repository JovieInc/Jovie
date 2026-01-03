/**
 * Format profile views count for display in admin tables
 * - Zero values: Display as em dash (—)
 * - Large numbers (≥10k): Abbreviate as "12.5k"
 * - Regular numbers: Format with commas (1,234)
 */
export function formatProfileViews(views: number): string {
  if (views === 0) return '—';
  if (views >= 10000) {
    return `${(views / 1000).toFixed(1)}k`;
  }
  return new Intl.NumberFormat('en-US').format(views);
}
