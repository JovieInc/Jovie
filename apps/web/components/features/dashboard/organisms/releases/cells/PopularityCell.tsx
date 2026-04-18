'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { memo } from 'react';
import { DrawerInlineIconButton } from '@/components/molecules/drawer';

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
          <DrawerInlineIconButton
            className='gap-1.5 rounded-full px-1 py-0.5 text-tertiary-token'
            aria-label={`Spotify popularity ${displayPopularity} out of 100`}
          >
            <div className='h-2 w-12 overflow-hidden rounded-full bg-(--linear-border-subtle)'>
              <div
                className='h-full rounded-full bg-brand-spotify transition-all'
                style={{ width: `${clampedPopularity}%` }}
              />
            </div>
          </DrawerInlineIconButton>
        ) : (
          <span className='text-[11px] text-tertiary-token'>—</span>
        )}
      </TooltipTrigger>
      {isValidPopularity && (
        <TooltipContent side='top' className='text-[11px]'>
          <span className='font-[510]'>{displayPopularity}</span>
          <span className='text-secondary-token'>/100 popularity</span>
        </TooltipContent>
      )}
    </Tooltip>
  );
});
