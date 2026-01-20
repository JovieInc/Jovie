'use client';

import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
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
        <AlertTriangle className='mx-auto h-12 w-12' aria-hidden='true' />
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
        className='rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
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
