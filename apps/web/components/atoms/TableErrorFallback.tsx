'use client';

import type { FallbackProps } from 'react-error-boundary';
import { PageErrorState } from '@/features/feedback/PageErrorState';

/**
 * Error fallback UI specifically for table components.
 * Delegates to PageErrorState with table-specific defaults.
 *
 * Designed to fit within table containers without breaking layout.
 */
export function TableErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  const errorWithDigest = error as Error & { digest?: string };

  return (
    <PageErrorState
      title='Unable to load table data'
      message={
        errorWithDigest.message ||
        'An unexpected error occurred while loading the table.'
      }
      error={errorWithDigest}
      actionLabel='Reload table'
      onRetry={resetErrorBoundary}
      extraContext={{ Context: 'Table' }}
    />
  );
}
