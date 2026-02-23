'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle } from 'lucide-react';
import { ErrorDetails } from './ErrorDetails';

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
  return (
    <div
      className='flex flex-1 flex-col items-center justify-center px-4 py-12 text-center'
      role='alert'
      aria-live='polite'
    >
      <div className='w-full max-w-sm space-y-4'>
        <div className='flex justify-center'>
          <div className='flex h-10 w-10 items-center justify-center text-destructive'>
            <AlertTriangle className='h-6 w-6' aria-hidden='true' />
          </div>
        </div>

        <div className='space-y-1.5'>
          <h1 className='text-sm font-medium text-secondary-token'>{title}</h1>
          <p className='text-[13px] text-tertiary-token'>{message}</p>
        </div>

        <div className='flex justify-center'>
          <Button
            variant='primary'
            size='sm'
            onClick={() => globalThis.location.reload()}
          >
            Refresh page
          </Button>
        </div>

        <ErrorDetails
          error={error}
          extraContext={{ Title: title, Message: message }}
        />
      </div>
    </div>
  );
}
