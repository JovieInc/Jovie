'use client';

import { ChevronRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { useInsightsSummaryQuery } from '@/lib/queries';
import { InsightCategoryIcon } from './InsightCategoryIcon';

export function InsightsSummaryWidget() {
  const { data, isLoading } = useInsightsSummaryQuery();

  if (isLoading) {
    return (
      <div>
        <div className='flex items-center gap-1.5'>
          <div className='h-4 w-4 rounded skeleton' />
          <div className='h-3 w-24 rounded skeleton' />
        </div>
        <div className='mt-1 space-y-1'>
          <div className='h-3 w-full rounded skeleton' />
          <div className='h-3 w-3/4 rounded skeleton' />
        </div>
      </div>
    );
  }

  const totalActive = data?.totalActive ?? 0;
  const insights = data?.insights ?? [];

  if (totalActive === 0) {
    return null;
  }

  return (
    <section aria-label='AI Insights summary' className='space-y-2'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-1.5'>
          <Sparkles className='h-3.5 w-3.5 text-secondary-token' />
          <span className='text-[13px] font-[510] text-primary-token'>
            AI Insights
          </span>
          <span className='inline-flex min-w-[18px] items-center justify-center rounded-md border border-(--linear-app-frame-seam) bg-surface-0 px-1.5 py-0.5 text-3xs font-[510] leading-none text-secondary-token tabular-nums'>
            {totalActive}
          </span>
        </div>
        <Link
          href={APP_ROUTES.INSIGHTS}
          className='inline-flex items-center gap-1 rounded-lg border border-transparent px-1.5 py-1 text-[11px] font-[510] text-secondary-token transition-[background-color,border-color,color] duration-150 hover:border-(--linear-app-frame-seam) hover:bg-surface-0 hover:text-primary-token'
        >
          <span>View all</span>
          <ChevronRight className='h-3 w-3' aria-hidden='true' />
        </Link>
      </div>

      {/* Top insights */}
      <ul className='space-y-1'>
        {insights.map(insight => (
          <li
            key={insight.id}
            className='flex items-start gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-[background-color,border-color] duration-150 hover:border-(--linear-app-frame-seam) hover:bg-surface-0'
          >
            <InsightCategoryIcon category={insight.category} size='sm' />
            <p className='line-clamp-2 text-xs leading-snug text-secondary-token'>
              <span className='font-[510] text-primary-token'>
                {insight.title}
              </span>
              {insight.actionSuggestion
                ? ` · ${insight.actionSuggestion}`
                : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
