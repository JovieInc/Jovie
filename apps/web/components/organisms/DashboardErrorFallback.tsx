'use client';

import { useRouter } from 'next/navigation';
import type { FallbackProps } from 'react-error-boundary';
import { PageErrorState } from '@/components/feedback/PageErrorState';

/**
 * Error fallback UI specifically for dashboard components.
 * Delegates to PageErrorState with dashboard-specific defaults.
 */
export function DashboardErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  const router = useRouter();
  const errorWithDigest = error as Error & { digest?: string };

  return (
    <PageErrorState
      title='Unable to load dashboard'
      message={
        errorWithDigest.message ||
        'An unexpected error occurred while loading your dashboard.'
      }
      error={errorWithDigest}
      actionLabel='Reload dashboard'
      onRetry={resetErrorBoundary}
      secondaryAction={{ label: 'Go home', onClick: () => router.push('/') }}
      extraContext={{ Context: 'Dashboard' }}
    />
  );
}
