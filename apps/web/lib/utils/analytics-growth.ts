/** Minimum base count before showing a percent delta in analytics chips. */
export const MIN_SAMPLE_FOR_PERCENT_DELTA = 30;

/**
 * Format a funnel-stage rate for display beside a metric value.
 *
 * Percent conversion is suppressed when the denominator is below
 * {@link MIN_SAMPLE_FOR_PERCENT_DELTA} — small bases produce vanity
 * noise like "1200%" that reads as growth rather than conversion.
 */
export function formatAnalyticsStageRate(
  current: number,
  base: number,
  minBaseForPercent: number = MIN_SAMPLE_FOR_PERCENT_DELTA
): string | null {
  if (base <= 0 || base < minBaseForPercent) {
    return null;
  }

  return `${Math.round((current / base) * 100)}%`;
}
