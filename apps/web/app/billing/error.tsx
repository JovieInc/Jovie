'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function BillingError({ error, reset }: Readonly<ErrorProps>) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Billing'
      message='We encountered an error loading billing. Please try again.'
    />
  );
}
