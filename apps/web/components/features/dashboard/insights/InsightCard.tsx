'use client';

import { Badge } from '@jovie/ui';
import type { InsightResponse } from '@/types/insights';
import { InsightActions } from './InsightActions';
import { InsightCategoryIcon } from './InsightCategoryIcon';

const PRIORITY_BADGE_STYLES = {
  high: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  medium: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  low: 'border-(--linear-app-frame-seam) bg-surface-0 text-secondary-token',
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
      className='border-b border-(--linear-app-frame-seam) px-1 py-3.5 transition-colors duration-subtle last:border-b-0 hover:bg-surface-0/60'
      aria-label={`${PRIORITY_LABELS[insight.priority]} insight: ${insight.title}`}
    >
      <div className='flex items-start gap-3'>
        <InsightCategoryIcon category={insight.category} />

        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <h3 className='text-app font-semibold leading-snug text-primary-token'>
              {insight.title}
            </h3>
            <Badge
              variant='secondary'
              size='sm'
              className={`rounded-md px-1.5 py-0.5 text-3xs ${PRIORITY_BADGE_STYLES[insight.priority]}`}
            >
              {PRIORITY_LABELS[insight.priority]}
            </Badge>
          </div>

          <p className='mt-1 text-app leading-relaxed text-secondary-token'>
            {insight.description}
          </p>

          {insight.actionSuggestion ? (
            <p className='mt-2 text-xs font-caption leading-5 text-primary-token'>
              {insight.actionSuggestion}
            </p>
          ) : null}

          <div className='mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-(--linear-app-frame-seam) pt-3'>
            <div className='flex items-center gap-2'>
              <span className='text-3xs font-caption text-secondary-token capitalize'>
                {insight.category}
              </span>
              <span className='text-3xs text-tertiary-token tabular-nums'>
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
