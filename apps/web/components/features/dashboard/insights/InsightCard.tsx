'use client';

import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { InsightResponse } from '@/types/insights';
import { InsightActions } from './InsightActions';
import { InsightCategoryIcon } from './InsightCategoryIcon';

const PRIORITY_STYLES = {
  high: 'border-l-orange-500 dark:border-l-orange-400',
  medium: 'border-l-blue-500 dark:border-l-blue-400',
  low: 'border-l-gray-400 dark:border-l-gray-500',
} as const;

const PRIORITY_LABELS = {
  high: 'High priority',
  medium: 'Medium',
  low: 'Low',
} as const;

interface InsightCardProps {
  readonly insight: InsightResponse;
}

export function InsightCard({ insight }: InsightCardProps) {
  return (
    <ContentSurfaceCard
      as='article'
      className={`border-l-[3px] ${PRIORITY_STYLES[insight.priority]} p-4 transition-[border-color,background-color,box-shadow] duration-150 hover:border-(--linear-border-default) hover:bg-(--linear-bg-surface-0)`}
      aria-label={`${PRIORITY_LABELS[insight.priority]} insight: ${insight.title}`}
    >
      <div className='flex items-start gap-3'>
        <InsightCategoryIcon category={insight.category} />

        <div className='min-w-0 flex-1'>
          {/* Title */}
          <h3 className='text-[13px] font-[590] text-primary-token leading-snug'>
            {insight.title}
          </h3>

          {/* Description */}
          <p className='mt-1 text-[13px] text-secondary-token leading-relaxed'>
            {insight.description}
          </p>

          {/* Action suggestion */}
          {insight.actionSuggestion ? (
            <p className='mt-2 text-[13px] font-[510] text-(--linear-text-primary)'>
              &rarr; {insight.actionSuggestion}
            </p>
          ) : null}

          {/* Footer: metadata + actions */}
          <div className='mt-3 flex flex-wrap items-center justify-between gap-2'>
            <div className='flex items-center gap-3'>
              <span className='text-[10px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
                {insight.category}
              </span>
              <span className='text-[10px] text-tertiary-token'>
                Confidence: {Math.round(Number(insight.confidence) * 100)}%
              </span>
            </div>
            <InsightActions insightId={insight.id} />
          </div>
        </div>
      </div>
    </ContentSurfaceCard>
  );
}
