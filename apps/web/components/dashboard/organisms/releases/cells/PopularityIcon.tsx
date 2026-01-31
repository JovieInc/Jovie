'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { memo } from 'react';

interface PopularityIconProps {
  readonly popularity: number | null | undefined;
}

/**
 * PopularityIcon - Signal-bars style icon showing popularity level
 *
 * Features:
 * - 3 vertical bars of increasing height (4px, 8px, 12px)
 * - Low (0-33): 1 bar filled, muted color
 * - Med (34-66): 2 bars filled, amber color
 * - High (67-100): 3 bars filled, green color
 * - Tooltip showing exact score
 */
export const PopularityIcon = memo(function PopularityIcon({
  popularity,
}: PopularityIconProps) {
  const isValidPopularity = popularity != null && Number.isFinite(popularity);

  if (!isValidPopularity) {
    return <span className='text-xs text-tertiary-token'>—</span>;
  }

  const clampedPopularity = Math.min(100, Math.max(0, popularity));
  const displayPopularity = Math.round(clampedPopularity);

  // Determine level: low (0-33), med (34-66), high (67-100)
  const getPopularityLevel = (value: number): 'low' | 'med' | 'high' => {
    if (value <= 33) return 'low';
    if (value <= 66) return 'med';
    return 'high';
  };
  const level = getPopularityLevel(clampedPopularity);

  // Color mapping for each level
  const colors = {
    low: 'bg-tertiary-token',
    med: 'bg-amber-500 dark:bg-amber-400',
    high: 'bg-green-500 dark:bg-green-400',
  };

  const activeColor = colors[level];
  const inactiveColor = 'bg-surface-3 dark:bg-surface-3';

  // Number of bars to fill based on level
  const barCounts: Record<'low' | 'med' | 'high', number> = {
    low: 1,
    med: 2,
    high: 3,
  };
  const filledBars = barCounts[level];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          className='inline-flex items-end gap-px rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
          aria-label={`Popularity ${displayPopularity} out of 100`}
        >
          {/* Bar 1 - shortest (4px) */}
          <div
            className={`w-[2px] rounded-sm ${filledBars >= 1 ? activeColor : inactiveColor}`}
            style={{ height: '4px' }}
          />
          {/* Bar 2 - medium (8px) */}
          <div
            className={`w-[2px] rounded-sm ${filledBars >= 2 ? activeColor : inactiveColor}`}
            style={{ height: '8px' }}
          />
          {/* Bar 3 - tallest (12px) */}
          <div
            className={`w-[2px] rounded-sm ${filledBars >= 3 ? activeColor : inactiveColor}`}
            style={{ height: '12px' }}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side='top' className='text-xs'>
        <span className='font-medium'>{displayPopularity}</span>
        <span className='text-secondary-token'>/100 popularity</span>
      </TooltipContent>
    </Tooltip>
  );
});
