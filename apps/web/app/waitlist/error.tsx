'use client';

import ErrorBoundary from '@/components/atoms/ErrorBoundary';

interface ErrorProps
  extends Readonly<{
    error: Error & { digest?: string };
    reset: () => void;
  }> {}

export default function WaitlistError({ error, reset }: Readonly<ErrorProps>) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Waitlist'
      message='We encountered an error. Please try again.'
    />
  );
}
