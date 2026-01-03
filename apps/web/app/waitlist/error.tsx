'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { isSentryInitialized } from '@/lib/sentry/init';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function WaitlistError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error to console for debugging
    console.error('[Waitlist Error]', error);

    // Report to Sentry if initialized
    if (isSentryInitialized()) {
      Sentry.captureException(error, {
        tags: { errorBoundary: 'waitlist' },
        extra: { digest: error.digest },
      });
    }
  }, [error]);

  return (
    <div className='flex flex-col items-center justify-center min-h-[400px] p-6 text-center'>
      <div
        className='w-full max-w-md rounded-2xl border border-subtle bg-surface-1 p-6 shadow-sm'
        role='alert'
        aria-live='polite'
      >
        <div className='space-y-4'>
          <div className='flex justify-center'>
            <div className='text-destructive'>
              <svg
                className='h-12 w-12'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
                aria-hidden='true'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z'
                />
              </svg>
            </div>
          </div>

          <div className='space-y-2'>
            <h3 className='heading-linear text-lg text-primary-token'>
              Something went wrong
            </h3>
            <p className='text-linear text-sm text-secondary-token'>
              We encountered an error. Please try again.
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
              onClick={() => (window.location.href = '/')}
              className='btn btn-md btn-secondary btn-press'
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
