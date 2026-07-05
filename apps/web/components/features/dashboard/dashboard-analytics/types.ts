import type { AnalyticsRange } from '@/types/analytics';

/** Ranges offered on the analytics page. */
export type Range = Extract<AnalyticsRange, '1d' | '7d' | '30d'>;

/**
 * Ranges rendered by the analytics page selector, in display order.
 * Labels and window semantics come from `@/lib/analytics/time-range`.
 */
export const ANALYTICS_PAGE_RANGES: readonly Range[] = [
  '1d',
  '7d',
  '30d',
] as const;
