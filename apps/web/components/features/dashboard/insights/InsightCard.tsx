'use client';

import { Badge } from '@jovie/ui';
import type { CSSProperties } from 'react';
import {
  type AccentPaletteName,
  getAccentCssVars,
} from '@/lib/ui/accent-palette';
import type { InsightResponse } from '@/types/insights';
import { InsightActions } from './InsightActions';
import { InsightCategoryIcon } from './InsightCategoryIcon';

// Priority is semantic: high → orange (warning), medium → blue (info),
// low → neutral token greyscale.
const PRIORITY_ACCENT: Record<
  InsightResponse['priority'],
  AccentPaletteName | null
> = {
  high: 'orange',
  medium: 'blue',
  low: null,
};

const PRIORITY_LABELS = {
  high: 'High priority',
  medium: 'Medium',
  low: 'Low',
} as const;

function priorityBadgeStyle(
  priority: InsightResponse['priority']
): CSSProperties | undefined {
  const accent = PRIORITY_ACCENT[priority];
  if (!accent) return undefined;
  const { solid, subtle } = getAccentCssVars(accent);
  return {
    color: solid,
    backgroundColor: subtle,
    borderColor: `color-mix(in oklab, ${solid} 35%, transparent)`,
  };
}

interface InsightCardProps {
  readonly insight: InsightResponse;
}

export function InsightCard({ insight }: InsightCardProps) {
  return (
    <article
      className='border-b border-subtle px-1 py-3.5 transition-colors duration-subtle last:border-b-0 hover:bg-surface-0/60'
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
              className={`rounded-md px-1.5 py-0.5 text-3xs ${
                insight.priority === 'low'
                  ? 'border-subtle bg-surface-0 text-secondary-token'
                  : ''
              }`}
              style={priorityBadgeStyle(insight.priority)}
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

          <div className='mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-subtle pt-3'>
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
