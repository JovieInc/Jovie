'use client';

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
    <article
      className={`rounded-xl border border-subtle border-l-[3px] ${PRIORITY_STYLES[insight.priority]} bg-surface-1 p-4 transition-all duration-200`}
      aria-label={`${PRIORITY_LABELS[insight.priority]} insight: ${insight.title}`}
    >
      <div className='flex items-start gap-3'>
        <InsightCategoryIcon category={insight.category} />

        <div className='min-w-0 flex-1'>
          {/* Title */}
          <h3 className='text-sm font-semibold text-primary-token leading-snug'>
            {insight.title}
          </h3>

          {/* Description */}
          <p className='mt-1 text-xs text-secondary-token leading-relaxed'>
            {insight.description}
          </p>

          {/* Action suggestion */}
          {insight.actionSuggestion ? (
            <p className='mt-2 text-xs font-medium text-accent-token'>
              &rarr; {insight.actionSuggestion}
            </p>
          ) : null}

          {/* Footer: metadata + actions */}
          <div className='mt-3 flex flex-wrap items-center justify-between gap-2'>
            <div className='flex items-center gap-3'>
              <span className='text-[10px] font-medium uppercase tracking-wider text-tertiary-token'>
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
    </article>
  );
}
