/**
 * Format Followers Utility
 *
 * Formats follower counts for display.
 */

export function formatFollowers(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M followers`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K followers`;
  }
  return `${count} followers`;
}
