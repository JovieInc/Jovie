'use client';

import { ChevronRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { InsightCategoryIcon } from '@/components/features/dashboard/insights/InsightCategoryIcon';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';
import type { ChatInsightsToolResult } from '../types';

interface ChatAnalyticsCardProps {
  readonly result: ChatInsightsToolResult;
}

export function formatChatActiveSignalsLabel(
  displayedCount: number,
  totalActive: number
): string {
  const signalWord = totalActive === 1 ? 'signal' : 'signals';

  if (displayedCount < totalActive) {
    return `Showing ${displayedCount} of ${totalActive} active ${signalWord}`;
  }

  return `${totalActive} active ${signalWord}`;
}

export function ChatAnalyticsCard({ result }: ChatAnalyticsCardProps) {
  if (!result.success || result.insights.length === 0) {
    return null;
  }

  const displayedCount = result.insights.length;
  const hasMoreSignals = displayedCount < result.totalActive;

  return (
    <section
      className='w-full max-w-3xl border-t border-(--linear-app-frame-seam) pt-4'
      data-testid='chat-analytics-card'
      aria-label={result.title}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-3'>
          <div className='flex h-5 w-5 shrink-0 items-center justify-center text-tertiary-token'>
            <Sparkles className='h-4 w-4' strokeWidth={2.2} />
          </div>
          <div className='min-w-0'>
            <p className='text-sm font-semibold leading-5 text-primary-token'>
              {result.title}
            </p>
            <p
              className='mt-1 text-xs leading-5 text-tertiary-token'
              data-testid='chat-analytics-signal-count'
            >
              {formatChatActiveSignalsLabel(displayedCount, result.totalActive)}
            </p>
          </div>
        </div>
        {hasMoreSignals ? (
          <Link
            href={APP_ROUTES.INSIGHTS}
            className='inline-flex shrink-0 items-center gap-1 rounded-lg border border-transparent px-1.5 py-1 text-2xs font-caption text-secondary-token transition-[background-color,border-color,color] duration-subtle hover:border-(--linear-app-frame-seam) hover:bg-surface-0 hover:text-primary-token'
          >
            <span>View all</span>
            <ChevronRight className='h-3 w-3' aria-hidden='true' />
          </Link>
        ) : null}
      </div>

      <ul
        className='mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-cols-3 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden'
        data-testid='chat-analytics-signal-carousel'
        aria-label='Top Signals'
      >
        {result.insights.map(insight => (
          <li
            key={insight.id}
            className={cn(
              'flex min-h-34 min-w-[min(20rem,84vw)] snap-start flex-col justify-between rounded-lg border border-subtle bg-surface-1 p-4 text-primary-token shadow-card md:min-w-0'
            )}
            data-testid='chat-analytics-signal-card'
          >
            <div className='flex items-center gap-2'>
              <span className='flex h-4 w-4 shrink-0 items-center justify-center text-tertiary-token'>
                <InsightCategoryIcon category={insight.category} size='sm' />
              </span>
              <span className='text-2xs font-medium capitalize leading-4 text-tertiary-token'>
                {insight.category.replaceAll('_', ' ')}
              </span>
            </div>
            <div className='mt-4 min-w-0'>
              <p className='text-pretty text-base font-semibold leading-[1.18] text-primary-token'>
                {insight.title}
              </p>
              <p className='mt-3 line-clamp-2 text-xs leading-5 text-secondary-token'>
                {insight.actionSuggestion ?? insight.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
