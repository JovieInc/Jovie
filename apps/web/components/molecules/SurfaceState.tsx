'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SurfaceStateValue =
  | 'loading'
  | 'loaded'
  | 'empty'
  | 'error'
  | 'refreshing';

export type SurfaceLoadingMode =
  | 'initial-page'
  | 'section'
  | 'background-refresh';

export interface SurfaceStateProps {
  readonly state: SurfaceStateValue;
  readonly loadingMode: SurfaceLoadingMode;
  readonly label: string;
  readonly children: ReactNode;
  readonly loading: ReactNode;
  readonly empty: ReactNode;
  readonly error: ReactNode;
  readonly status?: ReactNode;
  readonly minHeightClassName?: string;
  readonly className?: string;
}

export function SurfaceState({
  state,
  loadingMode,
  label,
  children,
  loading,
  empty,
  error,
  status,
  minHeightClassName,
  className,
}: SurfaceStateProps) {
  const isBusy = state === 'loading' || state === 'refreshing';
  const retainsContent = state === 'loaded' || state === 'refreshing';

  const stateContent = {
    loading,
    empty,
    error,
  }[state as 'loading' | 'empty' | 'error'];

  return (
    <div
      className={cn('relative', minHeightClassName, className)}
      data-slot='surface-state-frame'
      data-surface-state={state}
      data-loading-mode={loadingMode}
      aria-busy={isBusy}
    >
      {retainsContent ? (
        <div data-slot='surface-content'>{children}</div>
      ) : (
        <div
          data-slot='surface-state'
          role='status'
          aria-label={label}
          aria-live='polite'
        >
          {stateContent}
        </div>
      )}

      <div
        className={cn(
          'pointer-events-none absolute top-3 right-4 z-10 min-h-5',
          state !== 'refreshing' && 'invisible'
        )}
        data-slot='surface-status'
        role='status'
        aria-live={state === 'refreshing' ? 'polite' : undefined}
        aria-label={state === 'refreshing' ? label : undefined}
      >
        {state === 'refreshing' ? status : null}
      </div>
    </div>
  );
}
