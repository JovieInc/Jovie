'use client';

import { QueryErrorResetBoundary } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { PageErrorState } from '@/features/feedback/PageErrorState';

type CustomFallbackFn = (
  props: FallbackProps & { reset: () => void }
) => ReactNode;

interface QueryErrorBoundaryProps {
  readonly children: ReactNode;
  /**
   * Custom fallback component to render on error.
   * If not provided, uses PageErrorState with query-specific defaults.
   */
  readonly fallback?: CustomFallbackFn;
}

/**
 * Default error fallback UI for query errors.
 * Delegates to PageErrorState for consistent error presentation.
 */
function DefaultErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const errorWithDigest = error as Error & { digest?: string };

  return (
    <PageErrorState
      title='Something went wrong'
      message={errorWithDigest.message || 'An unexpected error occurred'}
      error={errorWithDigest}
      actionLabel='Try again'
      onRetry={resetErrorBoundary}
      extraContext={{ Context: 'Query' }}
    />
  );
}

/**
 * Creates a fallback render function for the error boundary.
 * Extracted to avoid defining components inside render.
 */
function createFallbackRender(customFallback?: CustomFallbackFn) {
  return function FallbackRender(props: FallbackProps) {
    if (customFallback) {
      return customFallback({ ...props, reset: props.resetErrorBoundary });
    }
    return <DefaultErrorFallback {...props} />;
  };
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
  const FallbackComponent = createFallbackRender(fallback);

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary onReset={reset} FallbackComponent={FallbackComponent}>
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
