'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang='en'>
      <body className='min-h-screen bg-black text-white flex items-center justify-center p-4'>
        <div className='max-w-md w-full text-center space-y-6'>
          {/* Logo */}
          <div className='flex justify-center'>
            <svg
              width='48'
              height='48'
              viewBox='0 0 32 32'
              fill='none'
              xmlns='http://www.w3.org/2000/svg'
              aria-hidden='true'
            >
              <rect width='32' height='32' rx='8' fill='white' />
              <path
                d='M10 22V10h4v12h-4zm8-12h4v8a4 4 0 01-4 4h-2v-4h2V10z'
                fill='black'
              />
            </svg>
          </div>

          {/* Error message */}
          <div className='space-y-2'>
            <h1 className='text-2xl font-semibold'>Something went wrong</h1>
            <p className='text-gray-400 text-sm'>
              We encountered an unexpected error. Our team has been notified.
            </p>
          </div>

          {/* Actions */}
          <div className='flex flex-col sm:flex-row gap-3 justify-center'>
            <button
              onClick={reset}
              className='inline-flex items-center justify-center h-10 px-6 text-sm font-medium rounded-lg bg-white text-black hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black'
            >
              Try again
            </button>
            <a
              href='/'
              className='inline-flex items-center justify-center h-10 px-6 text-sm font-medium rounded-lg border border-gray-700 text-white hover:bg-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black'
            >
              Go home
            </a>
          </div>

          {/* Error digest for debugging */}
          {error.digest && (
            <p className='text-xs text-gray-600'>Error ID: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
