'use client';

import { useInsightsSummaryQuery } from '@/lib/queries/useInsightsQuery';

/**
 * Small badge showing the count of active high-priority insights.
 * Renders inline next to the "Insights" nav label.
 * Returns null if there are no active insights.
 */
export function InsightsBadge() {
  const { data } = useInsightsSummaryQuery();

  const count = data?.totalActive ?? 0;
  if (count === 0) return null;

  return (
    <span className='ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-500/15 px-1 text-[10px] font-medium text-purple-600 dark:bg-purple-500/20 dark:text-purple-400'>
      {count > 99 ? '99+' : count}
    </span>
  );
}
