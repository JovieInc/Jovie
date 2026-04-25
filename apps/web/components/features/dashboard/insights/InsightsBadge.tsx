'use client';

import { useInsightsSummaryQuery } from '@/lib/queries';

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
    <span className='ml-auto inline-flex min-w-[18px] items-center justify-center rounded-md border border-(--linear-app-frame-seam) bg-surface-0 px-1.5 py-0.5 text-3xs font-caption leading-none text-secondary-token tabular-nums'>
      {count > 99 ? '99+' : count}
    </span>
  );
}
