'use client';

import { Sparkles } from 'lucide-react';
import { InsightCategoryIcon } from '@/components/features/dashboard/insights/InsightCategoryIcon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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
      className='w-full max-w-xl p-4'
      data-testid='chat-analytics-card'
    >
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <div className='flex h-7 w-7 items-center justify-center rounded-lg border border-subtle bg-surface-0'>
            <Sparkles className='h-3.5 w-3.5 text-secondary-token' />
          </div>
          <div>
            <p className='text-[13px] font-[510] text-primary-token'>
              {result.title}
            </p>
            <p className='text-[11px] text-tertiary-token'>
              {result.totalActive} active{' '}
              {result.totalActive === 1 ? 'signal' : 'signals'}
            </p>
          </div>
        </div>
      </div>

      <ul className='mt-3 space-y-2.5'>
        {result.insights.map(insight => (
          <li key={insight.id} className='flex items-start gap-2.5'>
            <InsightCategoryIcon category={insight.category} size='sm' />
            <div className='min-w-0'>
              <p className='text-[13px] font-[510] leading-snug text-primary-token'>
                {insight.title}
              </p>
              <p className='mt-0.5 text-[13px] leading-snug text-secondary-token'>
                {insight.actionSuggestion ?? insight.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </ContentSurfaceCard>
  );
}
