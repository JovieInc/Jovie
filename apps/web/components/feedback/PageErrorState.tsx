'use client';

import { AlertTriangle, Copy, RefreshCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface PageErrorStateProps {
  readonly title?: string;
  readonly message: string;
  readonly error?: Error & { digest?: string };
}

/**
 * Reusable error state component for server-side pages.
 * Shows a centered error message with instructions to refresh.
 *
 * For client-side error boundaries, use the ErrorBoundary component instead.
 */
export function PageErrorState({
  title = 'Something went wrong',
  message,
  error,
}: PageErrorStateProps) {
  const [timestamp] = useState(() => new Date());

  const handleCopyErrorDetails = () => {
    const details = [
      `Error ID: ${error?.digest || 'unknown'}`,
      `Time: ${timestamp.toISOString()}`,
      `Title: ${title}`,
      `Message: ${message}`,
      `URL: ${globalThis.location?.href ?? 'N/A'}`,
      `User Agent: ${globalThis.navigator?.userAgent ?? 'N/A'}`,
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
    <div
      className='flex items-center justify-center min-h-[300px]'
      role='alert'
      aria-live='polite'
    >
      <div className='w-full max-w-lg rounded-xl border border-subtle bg-surface-1 p-6 text-center shadow-sm'>
        <div className='flex justify-center mb-4'>
          <div className='rounded-full bg-destructive/10 p-3'>
            <AlertTriangle
              className='h-6 w-6 text-destructive'
              aria-hidden='true'
            />
          </div>
        </div>
        <h1 className='mb-3 text-sm font-medium text-secondary-token'>
          {title}
        </h1>
        <p className='mb-4 text-secondary-token'>{message}</p>

        <div className='mb-4 pt-4 border-t border-subtle space-y-2'>
          {error?.digest && (
            <p className='text-xs text-muted-foreground'>
              Error ID: {error.digest}
            </p>
          )}
          <p className='text-xs text-muted-foreground'>
            Occurred at: {timestamp.toLocaleString()}
          </p>
        </div>

        <div className='flex flex-col gap-2 items-center'>
          <button
            type='button'
            onClick={() => globalThis.location.reload()}
            className='inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors'
          >
            <RefreshCcw className='h-4 w-4' aria-hidden='true' />
            Refresh page
          </button>

          <button
            type='button'
            onClick={handleCopyErrorDetails}
            className='inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors'
            aria-label='Copy error details to clipboard'
          >
            <Copy className='h-3 w-3' aria-hidden='true' />
            Copy Error Details
          </button>
        </div>

        {process.env.NODE_ENV === 'development' && error?.message && (
          <details className='mt-4 rounded-md bg-surface-2 p-3 text-left'>
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
