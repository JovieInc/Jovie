import { Button } from '@jovie/ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type HomeLoopSectionStatus = 'loading' | 'error' | 'ready';

/**
 * One Home loop section: Title Case heading with an optional count, and a
 * body whose loading, error, empty, and populated states share one reserved
 * frame so sibling sections never move when data arrives.
 */
export function HomeLoopSection({
  title,
  count,
  status,
  isEmpty,
  emptyLabel,
  errorLabel,
  onRetry,
  skeleton,
  minBodyClassName,
  className,
  children,
  testId,
}: Readonly<{
  readonly title: string;
  readonly count?: number | null;
  readonly status: HomeLoopSectionStatus;
  readonly isEmpty: boolean;
  readonly emptyLabel: string;
  readonly errorLabel: string;
  readonly onRetry?: () => void;
  readonly skeleton: ReactNode;
  /** Reserved minimum body height, so state changes stay local. */
  readonly minBodyClassName?: string;
  readonly className?: string;
  readonly children: ReactNode;
  readonly testId: string;
}>) {
  const headingId = `${testId}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={status === 'loading'}
      className={cn('flex min-w-0 flex-col gap-2', className)}
      data-state={
        status === 'ready' ? (isEmpty ? 'empty' : 'populated') : status
      }
      data-testid={testId}
    >
      <h2
        id={headingId}
        className='flex items-center gap-2 text-balance text-xs font-medium text-secondary-token'
      >
        {title}
        {status === 'ready' && count != null && count > 0 ? (
          <span
            className='rounded-full bg-surface-2 px-1.5 text-2xs font-semibold tabular-nums text-primary-token'
            data-testid={`${testId}-count`}
          >
            {count}
          </span>
        ) : null}
      </h2>
      <div className={cn('min-w-0', minBodyClassName)}>
        {status === 'loading' ? (
          skeleton
        ) : status === 'error' ? (
          <div
            role='alert'
            className='flex flex-wrap items-center gap-3 rounded-lg border border-subtle px-3 py-2 text-xs text-secondary-token'
          >
            <span>{errorLabel}</span>
            {onRetry ? (
              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={onRetry}
              >
                {/* ui-casing-allow: recovery action sentence case (Tim, 2026-09-28) */}
                Try again
              </Button>
            ) : null}
          </div>
        ) : isEmpty ? (
          <p className='rounded-lg border border-dashed border-subtle px-3 py-2 text-xs text-tertiary-token'>
            {emptyLabel}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
