'use client';

import type { FallbackProps } from 'react-error-boundary';
import { PageErrorState } from '@/features/feedback/PageErrorState';

/**
 * Error fallback UI specifically for dashboard components.
 * Delegates to PageErrorState with dashboard-specific defaults.
 */
export function DashboardErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  const errorWithDigest = error as Error & { digest?: string };

  return (
    <PageErrorState
      title='Unable to Load Dashboard'
      message={
        errorWithDigest.message ||
        'An unexpected error occurred while loading your dashboard.'
      }
      error={errorWithDigest}
      actionLabel='Retry'
      onRetry={resetErrorBoundary}
      extraContext={{ Context: 'Dashboard' }}
    />
  );
}
