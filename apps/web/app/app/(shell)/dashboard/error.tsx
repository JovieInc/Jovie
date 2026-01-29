'use client';

import ErrorBoundary from '@/components/atoms/ErrorBoundary';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

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
