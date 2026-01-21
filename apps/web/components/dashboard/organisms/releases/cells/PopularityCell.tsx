'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';

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
export function PopularityCell({ popularity }: PopularityCellProps) {
  if (popularity === null || popularity === undefined) {
    return <span className='text-xs text-tertiary-token'>-</span>;
  }

  if (!Number.isFinite(popularity)) {
    return <span className='text-xs text-tertiary-token'>-</span>;
  }

  const clampedPopularity = Math.min(100, Math.max(0, popularity));
  const displayPopularity = Math.round(clampedPopularity);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
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
      </TooltipTrigger>
      <TooltipContent side='top' className='text-xs'>
        <span className='font-medium'>{displayPopularity}</span>
        <span className='text-secondary-token'>/100 popularity</span>
      </TooltipContent>
    </Tooltip>
  );
}
