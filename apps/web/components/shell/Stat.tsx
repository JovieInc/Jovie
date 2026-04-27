import { cn } from '@/lib/utils';

export interface StatProps {
  /** Caption above the value (uppercase tracking-wide). */
  readonly label: string;
  /** Pre-formatted value string. The component does not format numbers. */
  readonly value: string;
  /** Render the value in a monospace font with extra letter-spacing. */
  readonly mono?: boolean;
  /** Tabular-nums for numeric values that need column alignment. */
  readonly tabular?: boolean;
  readonly className?: string;
}

/**
 * Stat — small label-over-value column. Pairs nicely with Sparkline
 * inside an entity drawer's performance / analytics tab. The value is
 * rendered as-is so callers stay in control of formatting (locale,
 * currency, units) and don't pull a number-formatter library into the
 * shell.
 *
 * @example
 * ```tsx
 * <div className='flex items-end gap-6'>
 *   <Stat label='Clicks' value='1,247' tabular />
 *   <Stat label='Avg / day' value='178' tabular />
 *   <Stat label='ISRC' value='USAT22300100' mono />
 * </div>
 * ```
 */
export function Stat({ label, value, mono, tabular, className }: StatProps) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className='text-[9.5px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
        {label}
      </span>
      <span
        className={cn(
          'text-[13px] text-primary-token',
          mono && 'font-mono tracking-wide',
          tabular && 'tabular-nums'
        )}
      >
        {value}
      </span>
    </div>
  );
}
