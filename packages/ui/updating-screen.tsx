'use client';

import type { ReactNode } from 'react';
import { ProgressBar } from './atoms/progress';
import { JovieO } from './brand/JovieO';
import { cn } from './lib/utils';

export interface UpdatingScreenProps {
  /** Pass a heading element for dialog semantics; strings render as an h1. */
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly progressLabel: string;
  /** Real updater progress only. Omit when the total is unknown. */
  readonly progress?: number;
  readonly state?: 'updating' | 'ready' | 'error';
  /** Measured transfer size, speed, or a truthful phase label. */
  readonly details?: ReactNode;
  /** Native updater actions or a manual-download fallback, owned by the caller. */
  readonly actions?: ReactNode;
  readonly layout?: 'page' | 'embedded';
  readonly className?: string;
}

/**
 * Shared update presentation, not an updater: callers own lifecycle and actions.
 * JovieO and ProgressBar own brand geometry, motion and progress semantics.
 */
export function UpdatingScreen({
  title,
  description,
  progressLabel,
  progress,
  state = 'updating',
  details,
  actions,
  layout = 'page',
  className,
}: UpdatingScreenProps) {
  const percent =
    typeof progress === 'number' && Number.isFinite(progress)
      ? Math.min(100, Math.max(0, progress))
      : undefined;
  const updating = state === 'updating';

  return (
    <div
      data-slot='updating-screen'
      data-state={state}
      className={cn(
        'flex w-full flex-col items-center justify-center text-center text-primary-token',
        layout === 'page'
          ? 'min-h-svh bg-surface-0 px-6 py-16'
          : 'min-h-80 px-2 py-8',
        className
      )}
    >
      <div className='flex w-full max-w-sm flex-col items-center'>
        <div
          aria-hidden='true'
          className='mb-8 flex size-12 items-center justify-center'
        >
          <JovieO
            size={48}
            state={
              updating ? 'loading' : state === 'ready' ? 'success' : 'error'
            }
          />
        </div>

        <div
          role='status'
          aria-live='polite'
          aria-atomic='true'
          className='w-full space-y-2'
        >
          {typeof title === 'string' ? (
            <h1 className='text-base font-semibold tracking-tight text-balance'>
              {title}
            </h1>
          ) : (
            title
          )}
          {typeof description === 'string' ? (
            <p className='text-sm leading-relaxed text-secondary-token text-pretty'>
              {description}
            </p>
          ) : (
            description
          )}
        </div>

        <div className='mt-8 w-full max-w-xs space-y-3'>
          <div className='min-h-1.5'>
            {updating ? (
              <ProgressBar
                value={percent}
                aria-label={progressLabel}
                trackClassName='bg-(--color-border-strong)'
              />
            ) : null}
          </div>
          <div className='min-h-5 text-sm font-medium tabular-nums text-primary-token'>
            {updating && percent !== undefined
              ? `${Math.round(percent)}%`
              : null}
          </div>
          <div className='min-h-5 text-xs tabular-nums text-secondary-token'>
            {details}
          </div>
        </div>

        <div className='mt-6 flex min-h-11 w-full flex-wrap items-center justify-center gap-3'>
          {actions}
        </div>
      </div>
    </div>
  );
}
