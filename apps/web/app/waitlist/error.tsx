'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';

interface ErrorProps
  extends Readonly<{
    readonly error: Error & { digest?: string };
    readonly reset: () => void;
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
