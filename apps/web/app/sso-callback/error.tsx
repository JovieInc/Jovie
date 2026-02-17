'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function SSOCallbackError({
  error,
  reset,
}: Readonly<ErrorProps>) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='SSOCallback'
      message='We encountered an error during sign-in. Please try again.'
    />
  );
}
