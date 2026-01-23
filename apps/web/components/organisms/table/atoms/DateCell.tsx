'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import React from 'react';
import { typography } from '../table.styles';

interface DateCellProps {
  /**
   * Date to display
   */
  date: Date | null;

  /**
   * Date format options for the cell display
   * @default { year: 'numeric', month: 'short', day: 'numeric' }
   */
  formatOptions?: Intl.DateTimeFormatOptions;

  /**
   * Date format options for the tooltip
   * @default { year: 'numeric', month: 'long', day: 'numeric' }
   */
  tooltipFormatOptions?: Intl.DateTimeFormatOptions;

  /**
   * Locale for date formatting
   * @default 'en-US'
   */
  locale?: string;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * DateCell - Formatted date display with tooltip
 *
 * Memoized for performance in virtualized tables to prevent unnecessary re-renders.
 *
 * Features:
 * - User-friendly relative/absolute dates
 * - Full timestamp on hover
 * - Tertiary typography style
 * - Null-safe with dash fallback
 * - Customizable format and locale
 *
 * Example:
 * ```tsx
 * <DateCell date={profile.createdAt} />
 * ```
 */
export const DateCell = React.memo(function DateCell({
  date,
  formatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  },
  tooltipFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  },
  locale = 'en-US',
  className,
}: DateCellProps) {
  // Format user-friendly date
  const formatted = date
    ? new Intl.DateTimeFormat(locale, formatOptions).format(date)
    : null;

  // Format full date for tooltip
  const fullDate = date
    ? new Intl.DateTimeFormat(locale, tooltipFormatOptions).format(date)
    : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`${typography.cellTertiary} whitespace-nowrap ${date ? 'cursor-help' : ''} ${className || ''}`}
        >
          {formatted || '—'}
        </span>
      </TooltipTrigger>
      {fullDate && (
        <TooltipContent side='top' className='text-xs'>
          {fullDate}
        </TooltipContent>
      )}
    </Tooltip>
  );
});
