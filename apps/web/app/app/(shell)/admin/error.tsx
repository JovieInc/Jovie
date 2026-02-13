'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function AdminError({ error, reset }: ErrorProps) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Admin'
      message='We encountered an error loading this admin page. Please try again or return to the admin dashboard.'
    />
  );
}
