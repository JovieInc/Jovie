'use client';

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
 * DateCell - Formatted date display
 *
 * Features:
 * - Consistent date formatting across tables
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

  const formatted = new Intl.DateTimeFormat(locale, formatOptions).format(date);

  return (
    <span
      className={`${typography.cellTertiary} whitespace-nowrap ${className || ''}`}
    >
      {formatted}
    </span>
  );
}
