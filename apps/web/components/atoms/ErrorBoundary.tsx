'use client';

import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { isSentryInitialized } from '@/lib/sentry/init';

interface ErrorBoundaryProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
  readonly context: string;
  readonly message?: string;
}

export default function ErrorBoundary({
  error,
  reset,
  context,
  message = 'We encountered an error loading this page. ' + 'Please try again.',
}: ErrorBoundaryProps) {
  const router = useRouter();
  const [timestamp] = useState(() => new Date());

  useEffect(() => {
    // Log error to console for debugging
    console.error(`[${context} Error]`, error);

    // Report to Sentry if initialized
    if (isSentryInitialized()) {
      Sentry.captureException(error, {
        tags: { errorBoundary: context.toLowerCase() },
        extra: { digest: error.digest },
      });
    }
  }, [error, context]);

  const handleCopyErrorDetails = () => {
    const details = [
      `Error ID: ${error.digest || 'unknown'}`,
      `Time: ${timestamp.toISOString()}`,
      `Context: ${context}`,
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
    <div className='flex flex-col items-center justify-center min-h-[400px] p-6 text-center'>
      <div
        className={
          'w-full max-w-md rounded-2xl border border-subtle ' +
          'bg-surface-1 p-6 shadow-sm'
        }
        role='alert'
        aria-live='polite'
      >
        <div className='space-y-4'>
          <div className='flex justify-center'>
            <div className='text-destructive'>
              <AlertTriangle className='h-12 w-12' aria-hidden='true' />
            </div>
          </div>

          <div className='space-y-2'>
            <h3 className='heading-linear text-lg text-primary-token'>
              Something went wrong
            </h3>
            <p className='text-linear text-sm text-secondary-token'>
              {message}
            </p>
          </div>

          <div className='flex justify-center gap-3'>
            <button
              type='button'
              onClick={reset}
              className='btn btn-md btn-primary btn-press'
            >
              Try again
            </button>
            <button
              type='button'
              onClick={() => router.push('/')}
              className='btn btn-md btn-secondary btn-press'
            >
              Go home
            </button>
          </div>

          <div className='mt-4 space-y-2 border-t border-subtle pt-4'>
            {error.digest && (
              <p className='text-xs text-muted-foreground text-center'>
                Error ID: {error.digest}
              </p>
            )}
            <p className='text-xs text-muted-foreground text-center'>
              Occurred at: {timestamp.toLocaleString()}
            </p>

            <div className='flex justify-center'>
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
          </div>

          {process.env.NODE_ENV === 'development' && error.message && (
            <details className='mt-4 rounded-md bg-surface-2 p-3'>
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
    </div>
  );
}
