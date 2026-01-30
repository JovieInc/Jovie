'use client';

import * as Sentry from '@sentry/nextjs';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
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
        </div>
      </div>
    </div>
  );
}
