'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';
import type { ErrorProps } from '@/types/common';

export default function DashboardError({ error, reset }: ErrorProps) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Dashboard'
      message={
        'We encountered an error loading your dashboard. Please try again.'
      }
    />
  );
}
