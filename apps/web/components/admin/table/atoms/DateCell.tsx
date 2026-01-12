'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { typography } from '../table.styles';

interface DateCellProps {
  /**
   * Date to display
   */
  date: Date | null;

  /**
   * Date format options
   * @default { year: 'numeric', month: 'short', day: 'numeric' }
   */
  formatOptions?: Intl.DateTimeFormatOptions;

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
export function DateCell({
  date,
  formatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  },
  locale = 'en-US',
  className,
}: DateCellProps) {
  if (!date) {
    return <span className={typography.cellTertiary}>—</span>;
  }

  // Format user-friendly date
  const formatted = new Intl.DateTimeFormat(locale, formatOptions).format(date);

  // Format full timestamp for tooltip
  const fullTimestamp = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(date);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`${typography.cellTertiary} whitespace-nowrap cursor-help ${className || ''}`}
        >
          {formatted}
        </span>
      </TooltipTrigger>
      <TooltipContent side='top' className='text-xs'>
        {fullTimestamp}
      </TooltipContent>
    </Tooltip>
  );
}
