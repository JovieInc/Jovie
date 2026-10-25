import { cn } from '@/lib/utils';

export interface QuietRow {
  readonly id: string;
  /** What it is, in plain words (14px). */
  readonly primary: string;
  /** The quiet detail: a number, a stage, a time (12px, muted). */
  readonly secondary?: string | null;
  /** Draws the eye: failing or blocked work. */
  readonly attention?: boolean;
  readonly href?: string | null;
}

/**
 * One calm list for every Home column: one line per item, primary 14px over
 * secondary 12px muted, 8px rhythm, and a quiet "+N more" instead of a wall.
 */
export function OvieQuietList({
  rows,
  more = 0,
  moreLabel = 'more',
  testId,
}: Readonly<{
  rows: readonly QuietRow[];
  more?: number;
  moreLabel?: string;
  testId?: string;
}>) {
  return (
    <div className='flex min-h-0 flex-col gap-2' data-testid={testId}>
      <ul className='flex min-h-0 flex-col gap-2 overflow-hidden'>
        {rows.map(row => {
          const primary = (
            <span
              className={cn(
                'truncate text-sm',
                row.attention ? 'text-primary-token' : 'text-secondary-token'
              )}
            >
              {row.primary}
            </span>
          );
          return (
            <li
              key={row.id}
              className='flex min-w-0 items-baseline justify-between gap-3'
              data-attention={row.attention ? 'true' : undefined}
            >
              {row.href ? (
                <a
                  href={row.href}
                  className='min-w-0 hover:text-primary-token focus-visible:underline'
                >
                  {primary}
                </a>
              ) : (
                primary
              )}
              {row.secondary ? (
                <span className='shrink-0 text-xs tabular-nums text-tertiary-token'>
                  {row.secondary}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {more > 0 ? (
        <p
          className='text-xs tabular-nums text-tertiary-token'
          data-testid='ovie-quiet-more'
        >{`+${more.toLocaleString('en-US')} ${moreLabel}`}</p>
      ) : null}
    </div>
  );
}
