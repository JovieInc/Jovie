'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { FallbackProps } from 'react-error-boundary';
import { ErrorDetails } from '@/components/feedback/ErrorDetails';

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
  const errorWithDigest = error as Error & { digest?: string };

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
          <h2 className='text-sm font-medium text-secondary-token'>
            Unable to load dashboard
          </h2>
          <p className='text-[13px] text-tertiary-token'>
            {error?.message ||
              'An unexpected error occurred while loading your dashboard.'}
          </p>
        </div>

        <div className='flex justify-center gap-3'>
          <Button variant='primary' size='sm' onClick={resetErrorBoundary}>
            Reload dashboard
          </Button>
          <Button variant='outline' size='sm' onClick={() => router.push('/')}>
            Go home
          </Button>
        </div>

        <ErrorDetails
          error={errorWithDigest}
          extraContext={{ Context: 'Dashboard' }}
        />
      </div>
    </div>
  );
}
