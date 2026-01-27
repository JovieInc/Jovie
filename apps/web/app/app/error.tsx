'use client';

import ErrorBoundary from '@/components/atoms/ErrorBoundary';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: ErrorProps) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='App'
      message='We encountered an error loading this page. Please try again.'
    />
  );
}
