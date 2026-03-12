'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { memo } from 'react';

interface PopularityCellProps {
  readonly popularity: number | null | undefined;
}

/**
 * PopularityCell - Display Spotify popularity as a tiny bar graph
 *
 * Features:
 * - Visual bar graph representation (0-100 scale)
 * - Tooltip showing exact score
 * - Spotify green color for the filled portion
 */
export const PopularityCell = memo(function PopularityCell({
  popularity,
}: PopularityCellProps) {
  const isValidPopularity = popularity != null && Number.isFinite(popularity);

  const clampedPopularity = isValidPopularity
    ? Math.min(100, Math.max(0, popularity))
    : 0;
  const displayPopularity = Math.round(clampedPopularity);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {isValidPopularity ? (
          <button
            type='button'
            className='inline-flex items-center gap-1.5 rounded-[6px] border border-transparent px-1 py-0.5 focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
            aria-label={`Spotify popularity ${displayPopularity} out of 100`}
          >
            <div className='h-2 w-12 overflow-hidden rounded-full bg-(--linear-border-subtle)'>
              <div
                className='h-full rounded-full bg-brand-spotify transition-all'
                style={{ width: `${clampedPopularity}%` }}
              />
            </div>
          </button>
        ) : (
          <span className='text-[11px] text-(--linear-text-tertiary)'>—</span>
        )}
      </TooltipTrigger>
      {isValidPopularity && (
        <TooltipContent side='top' className='text-[11px]'>
          <span className='font-[510]'>{displayPopularity}</span>
          <span className='text-(--linear-text-secondary)'>
            /100 popularity
          </span>
        </TooltipContent>
      )}
    </Tooltip>
  );
});
