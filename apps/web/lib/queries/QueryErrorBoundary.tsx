'use client';

import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { AlertTriangle, Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { toast } from 'sonner';

type CustomFallbackFn = (
  props: FallbackProps & { reset: () => void }
) => ReactNode;

interface QueryErrorBoundaryProps {
  readonly children: ReactNode;
  /**
   * Custom fallback component to render on error.
   * If not provided, uses DefaultErrorFallback.
   */
  readonly fallback?: CustomFallbackFn;
}

/**
 * Default error fallback UI for query errors.
 * Shows error message with a retry button.
 */
function DefaultErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const [timestamp] = useState(() => new Date());

  const errorDigest = (error as Error & { digest?: string })?.digest;

  const handleCopyErrorDetails = () => {
    const details = [
      `Error ID: ${errorDigest || 'unknown'}`,
      `Time: ${timestamp.toISOString()}`,
      `Context: Query`,
      `Message: ${error?.message || 'An unexpected error occurred'}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : 'N/A'}`,
      `User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}`,
    ].join('\n');

    navigator.clipboard
      .writeText(details)
      .then(() => {
        toast.success('Error details copied to clipboard');
      })
      .catch(() => {
        toast.error('Failed to copy error details');
      });
  };

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

      <div className='mt-2 pt-4 border-t border-border space-y-2 w-full max-w-md'>
        {errorDigest && (
          <p className='text-xs text-muted-foreground'>
            Error ID: {errorDigest}
          </p>
        )}
        <p className='text-xs text-muted-foreground'>
          Occurred at: {timestamp.toLocaleString()}
        </p>

        <button
          type='button'
          onClick={handleCopyErrorDetails}
          className='inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors'
          aria-label='Copy error details to clipboard'
        >
          <Copy className='h-3 w-3' aria-hidden='true' />
          Copy Error Details
        </button>
      </div>

      {process.env.NODE_ENV === 'development' && error?.message && (
        <details className='mt-4 rounded-md bg-secondary/30 p-3 w-full max-w-md text-left'>
          <summary className='cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground'>
            Developer Info (dev only)
          </summary>
          <pre className='mt-2 overflow-auto text-xs text-muted-foreground whitespace-pre-wrap break-words'>
            {error.message}
            {error.stack && `\n\n${error.stack}`}
          </pre>
        </details>
      )}
    </div>
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
