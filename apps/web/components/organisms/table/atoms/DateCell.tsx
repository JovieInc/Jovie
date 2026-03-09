'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import React, { useMemo } from 'react';
import { cn, typography } from '../table.styles';

const defaultFormatOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

const defaultTooltipFormatOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

const defaultFormatter = new Intl.DateTimeFormat('en-US', defaultFormatOptions);
const defaultTooltipFormatter = new Intl.DateTimeFormat(
  'en-US',
  defaultTooltipFormatOptions
);

interface DateCellProps {
  /**
   * Date to display
   */
  readonly date: Date | null;

  /**
   * Date format options for the cell display
   * @default { year: 'numeric', month: 'short', day: 'numeric' }
   */
  readonly formatOptions?: Intl.DateTimeFormatOptions;

  /**
   * Date format options for the tooltip
   * @default { year: 'numeric', month: 'long', day: 'numeric' }
   */
  readonly tooltipFormatOptions?: Intl.DateTimeFormatOptions;

  /**
   * Locale for date formatting
   * @default 'en-US'
   */
  readonly locale?: string;

  /**
   * Additional CSS classes
   */
  readonly className?: string;
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
  formatOptions,
  tooltipFormatOptions,
  locale,
  className,
}: DateCellProps) {
  const isDefault = !formatOptions && !tooltipFormatOptions && !locale;
  const cellFormatter = useMemo(
    () =>
      isDefault
        ? defaultFormatter
        : new Intl.DateTimeFormat(
            locale ?? 'en-US',
            formatOptions ?? defaultFormatOptions
          ),
    [isDefault, locale, formatOptions]
  );
  const tipFormatter = useMemo(
    () =>
      isDefault
        ? defaultTooltipFormatter
        : new Intl.DateTimeFormat(
            locale ?? 'en-US',
            tooltipFormatOptions ?? defaultTooltipFormatOptions
          ),
    [isDefault, locale, tooltipFormatOptions]
  );

  const formatted = date ? cellFormatter.format(date) : '—';
  const fullDate = date ? tipFormatter.format(date) : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            typography.cellTertiary,
            'whitespace-nowrap',
            date && 'cursor-help',
            className
          )}
        >
          {formatted}
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
