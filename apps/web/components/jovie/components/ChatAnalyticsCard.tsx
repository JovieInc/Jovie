'use client';

import { Sparkles } from 'lucide-react';
import { InsightCategoryIcon } from '@/components/features/dashboard/insights/InsightCategoryIcon';
import { LINEAR_SURFACE } from '@/components/features/dashboard/tokens';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { cn } from '@/lib/utils';
import type { ChatInsightsToolResult } from '../types';

interface ChatAnalyticsCardProps {
  readonly result: ChatInsightsToolResult;
}

export function ChatAnalyticsCard({ result }: ChatAnalyticsCardProps) {
  if (!result.success || result.insights.length === 0) {
    return null;
  }

  return (
    <ContentSurfaceCard
      className='w-full max-w-3xl border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-4'
      data-testid='chat-analytics-card'
    >
      <div className='flex items-start gap-3'>
        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0'>
          <Sparkles className='h-3.5 w-3.5 text-secondary-token' />
        </div>
        <div className='min-w-0'>
          <p className='text-app font-medium text-primary-token'>
            {result.title}
          </p>
          <p className='mt-1 text-[12px] leading-5 text-tertiary-token'>
            {result.totalActive} active{' '}
            {result.totalActive === 1 ? 'signal' : 'signals'}
          </p>
        </div>
      </div>

      <ul
        className='mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-cols-3 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden'
        data-testid='chat-analytics-signal-carousel'
        aria-label='Top signal cards'
      >
        {result.insights.map(insight => (
          <li
            key={insight.id}
            className={cn(
              LINEAR_SURFACE.drawerCardSm,
              'flex min-h-[148px] min-w-[min(19.5rem,82vw)] snap-start flex-col justify-between p-4 md:min-w-0'
            )}
            data-testid='chat-analytics-signal-card'
          >
            <div className='flex items-center gap-2'>
              <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-0'>
                <InsightCategoryIcon category={insight.category} size='sm' />
              </span>
              <span className='text-[11px] font-medium capitalize leading-4 text-tertiary-token'>
                {insight.category.replaceAll('_', ' ')}
              </span>
            </div>
            <div className='mt-5 min-w-0'>
              <p className='text-pretty text-[15px] font-semibold leading-[1.28] text-primary-token'>
                {insight.title}
              </p>
              <p className='mt-2 line-clamp-2 text-[12.5px] leading-5 text-secondary-token'>
                {insight.actionSuggestion ?? insight.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </ContentSurfaceCard>
  );
}
