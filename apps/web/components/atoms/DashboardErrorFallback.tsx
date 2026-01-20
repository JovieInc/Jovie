'use client';

import { AlertTriangle, Home, RefreshCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { FallbackProps } from 'react-error-boundary';

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
      </div>
    </div>
  );
}
