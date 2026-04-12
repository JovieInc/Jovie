/**
 * Shared formatting utilities for admin dashboards.
 *
 * Extracted from duplicated implementations across FunnelMetricsStrip,
 * OutreachPipelineCard, AdminConversionFunnelSection, and HudDashboardClient.
 */

/** Format a decimal rate (0-1) as a percentage string, e.g. 0.423 → "42.3%". Returns "—" for null. */
export function formatPercent(rate: number | null): string {
  if (rate === null) return '\u2014';
  return `${(rate * 100).toFixed(1)}%`;
}

/** Format a USD value with locale-aware grouping, e.g. 1234 → "$1,234". */
export function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}
