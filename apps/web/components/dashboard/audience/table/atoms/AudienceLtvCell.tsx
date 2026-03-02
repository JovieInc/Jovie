'use client';

import { cn } from '@/lib/utils';

export interface AudienceLtvCellProps {
  readonly ltvCents: number;
  readonly className?: string;
}

/**
 * Formats cents into a compact dollar string.
 * e.g. 0 -> "—", 500 -> "$5", 1050 -> "$10.50"
 */
function formatLtv(cents: number): string {
  if (cents <= 0) return '\u2014'; // em dash
  const dollars = cents / 100;
  // Show decimals only if not a whole dollar amount
  if (dollars === Math.floor(dollars)) {
    return `$${dollars}`;
  }
  return `$${dollars.toFixed(2)}`;
}

export function AudienceLtvCell({ ltvCents, className }: AudienceLtvCellProps) {
  const formatted = formatLtv(ltvCents);
  const hasValue = ltvCents > 0;

  return (
    <span
      className={cn(
        'text-[13px] tabular-nums',
        hasValue
          ? 'text-emerald-600 dark:text-emerald-400 font-medium'
          : 'text-tertiary-token',
        className
      )}
    >
      {formatted}
    </span>
  );
}
