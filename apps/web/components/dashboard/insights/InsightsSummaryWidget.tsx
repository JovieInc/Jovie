'use client';

import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { useInsightsSummaryQuery } from '@/lib/queries/useInsightsQuery';
import { InsightCategoryIcon } from './InsightCategoryIcon';

export function InsightsSummaryWidget() {
  const { data, isLoading } = useInsightsSummaryQuery();

  if (isLoading) {
    return (
      <div className='rounded-xl border border-subtle bg-surface-1 p-4'>
        <div className='flex items-center gap-2'>
          <div className='h-4 w-4 animate-pulse rounded bg-surface-2' />
          <div className='h-3 w-24 animate-pulse rounded bg-surface-2' />
        </div>
        <div className='mt-3 space-y-2'>
          <div className='h-3 w-full animate-pulse rounded bg-surface-2' />
          <div className='h-3 w-3/4 animate-pulse rounded bg-surface-2' />
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
    <section
      className='rounded-xl border border-subtle bg-surface-1 p-4'
      aria-label='AI Insights summary'
    >
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <Sparkles className='h-4 w-4 text-purple-600 dark:text-purple-400' />
          <span className='text-xs font-semibold text-primary-token'>
            AI Insights
          </span>
          <span className='rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:bg-purple-500/15 dark:text-purple-400'>
            {totalActive}
          </span>
        </div>
        <Link
          href={APP_ROUTES.INSIGHTS}
          className='text-[11px] font-medium text-accent-token hover:underline'
        >
          View all &rarr;
        </Link>
      </div>

      {/* Top insights */}
      <ul className='mt-3 space-y-2'>
        {insights.map(insight => (
          <li key={insight.id} className='flex items-start gap-2'>
            <InsightCategoryIcon category={insight.category} size='sm' />
            <p className='text-xs text-secondary-token leading-snug line-clamp-2'>
              <span className='font-medium text-primary-token'>
                {insight.title}
              </span>
              {insight.actionSuggestion
                ? ` — ${insight.actionSuggestion}`
                : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
