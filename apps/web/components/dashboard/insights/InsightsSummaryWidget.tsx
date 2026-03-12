'use client';

import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { useInsightsSummaryQuery } from '@/lib/queries/useInsightsQuery';
import { InsightCategoryIcon } from './InsightCategoryIcon';

export function InsightsSummaryWidget() {
  const { data, isLoading } = useInsightsSummaryQuery();

  if (isLoading) {
    return (
      <ContentSurfaceCard className='p-4'>
        <div className='flex items-center gap-2'>
          <div className='h-4 w-4 rounded skeleton' />
          <div className='h-3 w-24 rounded skeleton' />
        </div>
        <div className='mt-3 space-y-2'>
          <div className='h-3 w-full rounded skeleton' />
          <div className='h-3 w-3/4 rounded skeleton' />
        </div>
      </ContentSurfaceCard>
    );
  }

  const totalActive = data?.totalActive ?? 0;
  const insights = data?.insights ?? [];

  if (totalActive === 0) {
    return null;
  }

  return (
    <ContentSurfaceCard
      as='section'
      className='p-4'
      aria-label='AI Insights summary'
    >
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <div className='flex h-7 w-7 items-center justify-center rounded-[10px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0)'>
            <Sparkles className='h-3.5 w-3.5 text-(--linear-text-secondary)' />
          </div>
          <span className='text-[13px] font-[510] text-primary-token'>
            AI Insights
          </span>
          <span className='rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-1.5 py-0.5 text-[10px] font-[510] text-(--linear-text-secondary)'>
            {totalActive}
          </span>
        </div>
        <Link
          href={APP_ROUTES.INSIGHTS}
          className='text-[11px] font-[510] text-(--linear-text-secondary) transition-colors hover:text-(--linear-text-primary)'
        >
          View all &rarr;
        </Link>
      </div>

      {/* Top insights */}
      <ul className='mt-3 space-y-2'>
        {insights.map(insight => (
          <li key={insight.id} className='flex items-start gap-2'>
            <InsightCategoryIcon category={insight.category} size='sm' />
            <p className='text-[13px] text-secondary-token leading-snug line-clamp-2'>
              <span className='font-[510] text-primary-token'>
                {insight.title}
              </span>
              {insight.actionSuggestion
                ? ` — ${insight.actionSuggestion}`
                : null}
            </p>
          </li>
        ))}
      </ul>
    </ContentSurfaceCard>
  );
}
