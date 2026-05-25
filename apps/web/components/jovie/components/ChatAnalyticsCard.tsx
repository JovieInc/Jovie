'use client';

import { Sparkles } from 'lucide-react';
import { InsightCategoryIcon } from '@/components/features/dashboard/insights/InsightCategoryIcon';
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
    <section
      className='w-full max-w-3xl border-t border-(--linear-app-frame-seam) pt-4'
      data-testid='chat-analytics-card'
      aria-label={result.title}
    >
      <div className='flex items-start gap-3'>
        <div className='flex h-5 w-5 shrink-0 items-center justify-center text-tertiary-token'>
          <Sparkles className='h-4 w-4' strokeWidth={2.2} />
        </div>
        <div className='min-w-0'>
          <p className='text-[14px] font-semibold leading-5 text-primary-token'>
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
        aria-label='Top signals'
      >
        {result.insights.map(insight => (
          <li
            key={insight.id}
            className={cn(
              'flex min-h-[136px] min-w-[min(20rem,84vw)] snap-start flex-col justify-between rounded-lg border border-black/10 bg-white p-4 text-black shadow-[0_18px_60px_-48px_rgba(0,0,0,0.7)] md:min-w-0'
            )}
            data-testid='chat-analytics-signal-card'
          >
            <div className='flex items-center gap-2'>
              <span className='flex h-4 w-4 shrink-0 items-center justify-center text-black/55'>
                <InsightCategoryIcon category={insight.category} size='sm' />
              </span>
              <span className='text-[11.5px] font-medium capitalize leading-4 text-black/55'>
                {insight.category.replaceAll('_', ' ')}
              </span>
            </div>
            <div className='mt-4 min-w-0'>
              <p className='text-pretty text-[17px] font-semibold leading-[1.18] text-black'>
                {insight.title}
              </p>
              <p className='mt-3 line-clamp-2 text-[12.5px] leading-5 text-black/60'>
                {insight.actionSuggestion ?? insight.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
