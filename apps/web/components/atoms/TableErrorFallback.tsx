'use client';

import { AlertTriangle, RefreshCcw } from 'lucide-react';
import type { FallbackProps } from 'react-error-boundary';

/**
 * Error fallback UI specifically for table components.
 * Shows error message with a retry button in a table-friendly layout.
 *
 * Designed to fit within table containers without breaking layout.
 */
export function TableErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  return (
    <div
      role='alert'
      className='flex flex-col items-center justify-center gap-4 p-8 text-center min-h-[400px]'
    >
      <div className='w-full max-w-md space-y-4'>
        <div className='flex justify-center'>
          <div className='rounded-full bg-destructive/10 p-4'>
            <AlertTriangle
              className='h-8 w-8 text-destructive'
              aria-hidden='true'
            />
          </div>
        </div>

        <div className='space-y-2'>
          <h3 className='text-lg font-semibold text-primary-token'>
            Unable to load table data
          </h3>
          <p className='text-sm text-secondary-token'>
            {error?.message ||
              'An unexpected error occurred while loading the table.'}
          </p>
        </div>

        <button
          type='button'
          onClick={resetErrorBoundary}
          className='inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors'
        >
          <RefreshCcw className='h-4 w-4' aria-hidden='true' />
          Reload table
        </button>
      </div>
    </div>
  );
}
