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

  const percentage = Math.min(100, Math.max(0, popularity));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className='flex items-center gap-1.5'>
          <div className='h-2 w-12 overflow-hidden rounded-full bg-surface-3'>
            <div
              className='h-full rounded-full bg-[#1DB954] transition-all'
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side='top' className='text-xs'>
        <span className='font-medium'>{popularity}</span>
        <span className='text-secondary-token'>/100 popularity</span>
      </TooltipContent>
    </Tooltip>
  );
}
