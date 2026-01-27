'use client';

import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface PageErrorStateProps {
  title?: string;
  message: string;
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
}: PageErrorStateProps) {
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
        <h1 className='mb-3 text-xl font-semibold text-primary-token'>
          {title}
        </h1>
        <p className='mb-4 text-secondary-token'>{message}</p>
        <button
          type='button'
          onClick={() => window.location.reload()}
          className='inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors'
        >
          <RefreshCcw className='h-4 w-4' aria-hidden='true' />
          Refresh page
        </button>
      </div>
    </div>
  );
}
