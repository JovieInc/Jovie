'use client';

import { IconButton, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
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
          <IconButton
            size='lg'
            variant='inline'
            aria-label={`Spotify popularity ${displayPopularity} out of 100`}
          >
            <div className='h-2 w-12 overflow-hidden rounded-full bg-subtle'>
              <div
                className='h-full rounded-full bg-brand-spotify transition-[background-color,width] duration-subtle ease-subtle'
                style={{ width: `${clampedPopularity}%` }}
              />
            </div>
          </IconButton>
        ) : (
          <span className='text-2xs text-tertiary-token'>—</span>
        )}
      </TooltipTrigger>
      {isValidPopularity && (
        <TooltipContent side='top'>
          <span className='font-caption'>{displayPopularity}</span>
          <span className='text-secondary-token'>/100 popularity</span>
        </TooltipContent>
      )}
    </Tooltip>
  );
});
