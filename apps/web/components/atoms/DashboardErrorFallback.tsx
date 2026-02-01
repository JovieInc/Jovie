'use client';

import { AlertTriangle, Copy, Home, RefreshCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { toast } from 'sonner';

/**
 * Error fallback UI specifically for dashboard components.
 * Shows error message with retry and home navigation buttons.
 *
 * Designed for full-page dashboard views with navigation options.
 */
export function DashboardErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  const router = useRouter();
  const [timestamp] = useState(() => new Date());

  const errorDigest = (error as Error & { digest?: string })?.digest;

  const handleCopyErrorDetails = () => {
    const details = [
      `Error ID: ${errorDigest || 'unknown'}`,
      `Time: ${timestamp.toISOString()}`,
      `Context: Dashboard`,
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
    <div className='flex flex-col items-center justify-center gap-6 p-8 text-center min-h-[500px]'>
      <div className='w-full max-w-lg space-y-6'>
        <div className='flex justify-center'>
          <div className='rounded-full bg-destructive/10 p-4'>
            <AlertTriangle
              className='h-12 w-12 text-destructive'
              aria-hidden='true'
            />
          </div>
        </div>

        <div className='space-y-3'>
          <h2 className='text-2xl font-semibold text-primary-token'>
            Unable to load dashboard
          </h2>
          <p className='text-base text-secondary-token'>
            {error?.message ||
              'An unexpected error occurred while loading your dashboard.'}
          </p>
        </div>

        <div className='flex justify-center gap-3'>
          <button
            type='button'
            onClick={resetErrorBoundary}
            className='inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors'
          >
            <RefreshCcw className='h-4 w-4' aria-hidden='true' />
            Reload dashboard
          </button>

          <button
            type='button'
            onClick={() => router.push('/')}
            className='inline-flex items-center gap-2 rounded-md bg-secondary px-5 py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 transition-colors'
          >
            <Home className='h-4 w-4' aria-hidden='true' />
            Go home
          </button>
        </div>

        <div className='mt-6 space-y-2 border-t border-subtle pt-4'>
          {errorDigest && (
            <p className='text-xs text-muted-foreground text-center'>
              Error ID: {errorDigest}
            </p>
          )}
          <p className='text-xs text-muted-foreground text-center'>
            Occurred at: {timestamp.toLocaleString()}
          </p>

          <div className='flex justify-center'>
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
        </div>

        {process.env.NODE_ENV === 'development' && error?.message && (
          <details className='mt-4 rounded-md bg-secondary/30 p-3'>
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
    </div>
  );
}
