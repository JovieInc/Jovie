/**
 * Format a number for display with locale-specific formatting.
 */
export function formatCount(value: number): string {
  return value.toLocaleString();
}
