'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { memo } from 'react';

interface PopularityCellProps {
  popularity: number | null | undefined;
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
  const isValid =
    popularity !== null &&
    popularity !== undefined &&
    Number.isFinite(popularity);
  const clampedPopularity = isValid
    ? Math.min(100, Math.max(0, popularity))
    : 0;
  const displayPopularity = isValid ? Math.round(clampedPopularity) : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {isValid ? (
          <button
            type='button'
            className='inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-spotify/50'
            aria-label={`Spotify popularity ${displayPopularity} out of 100`}
          >
            <div className='h-2 w-12 overflow-hidden rounded-full bg-surface-3'>
              <div
                className='h-full rounded-full bg-brand-spotify transition-all'
                style={{ width: `${clampedPopularity}%` }}
              />
            </div>
          </button>
        ) : (
          <span className='text-xs text-tertiary-token'>-</span>
        )}
      </TooltipTrigger>
      {isValid && (
        <TooltipContent side='top' className='text-xs'>
          <span className='font-medium'>{displayPopularity}</span>
          <span className='text-secondary-token'>/100 popularity</span>
        </TooltipContent>
      )}
    </Tooltip>
  );
});
