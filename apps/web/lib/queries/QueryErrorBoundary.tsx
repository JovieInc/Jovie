'use client';

import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';

interface QueryErrorBoundaryProps {
  children: ReactNode;
  /**
   * Custom fallback component to render on error.
   * If not provided, uses DefaultErrorFallback.
   */
  fallback?: (props: FallbackProps & { reset: () => void }) => ReactNode;
}

/**
 * Default error fallback UI for query errors.
 * Shows error message with a retry button.
 */
function DefaultErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className='flex flex-col items-center justify-center gap-4 p-6 text-center'>
      <div className='text-destructive'>
        <svg
          className='mx-auto h-12 w-12'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
          aria-hidden='true'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
          />
        </svg>
      </div>
      <div>
        <h3 className='text-lg font-semibold'>Something went wrong</h3>
        <p className='mt-1 text-sm text-muted-foreground'>
          {error?.message || 'An unexpected error occurred'}
        </p>
      </div>
      <button
        type='button'
        onClick={resetErrorBoundary}
        className='rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
      >
        Try again
      </button>
    </div>
  );
}

/**
 * Error boundary that integrates with TanStack Query's error reset.
 *
 * Wraps children in both QueryErrorResetBoundary and react-error-boundary
 * to provide automatic retry functionality for failed queries.
 *
 * When the "Try again" button is clicked:
 * 1. TanStack Query resets failed queries (clears error state)
 * 2. React error boundary resets (re-renders children)
 * 3. Queries automatically refetch
 *
 * @example
 * // Basic usage - wrap around components that fetch data
 * <QueryErrorBoundary>
 *   <DashboardContent />
 * </QueryErrorBoundary>
 *
 * @example
 * // Custom error fallback
 * <QueryErrorBoundary
 *   fallback={({ error, reset }) => (
 *     <CustomError message={error.message} onRetry={reset} />
 *   )}
 * >
 *   <DashboardContent />
 * </QueryErrorBoundary>
 */
export function QueryErrorBoundary({
  children,
  fallback,
}: QueryErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={props =>
            fallback ? (
              fallback({ ...props, reset: props.resetErrorBoundary })
            ) : (
              <DefaultErrorFallback {...props} />
            )
          }
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
