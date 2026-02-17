'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function MarketingError({ error, reset }: Readonly<ErrorProps>) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Marketing'
      message='We encountered an error loading this page. Please try again.'
    />
  );
}
