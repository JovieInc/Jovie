'use client';

import { Badge } from '@jovie/ui';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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
    <ContentSurfaceCard
      as='article'
      surface='details'
      className='p-3.5 transition-[border-color,background-color,box-shadow] duration-150 hover:border-default hover:bg-surface-0'
      aria-label={`${PRIORITY_LABELS[insight.priority]} insight: ${insight.title}`}
    >
      <div className='flex items-start gap-3'>
        <InsightCategoryIcon category={insight.category} />

        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <h3 className='text-[13px] font-[590] leading-snug text-primary-token'>
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

          <p className='mt-1 text-[13px] leading-relaxed text-secondary-token'>
            {insight.description}
          </p>

          {insight.actionSuggestion ? (
            <div className='mt-2 rounded-lg border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 py-2'>
              <p className='text-xs font-[510] text-primary-token'>
                {insight.actionSuggestion}
              </p>
            </div>
          ) : null}

          <div className='mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-(--linear-app-frame-seam) pt-3'>
            <div className='flex items-center gap-2'>
              <span className='rounded-md border border-(--linear-app-frame-seam) bg-surface-0 px-1.5 py-0.5 text-3xs font-[510] text-secondary-token capitalize'>
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
    </ContentSurfaceCard>
  );
}
