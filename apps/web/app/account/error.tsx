'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function AccountError({ error, reset }: Readonly<ErrorProps>) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Account'
      message='We encountered an error loading your account. Please try again.'
    />
  );
}
