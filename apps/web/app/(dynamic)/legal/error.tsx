'use client';

import ErrorBoundary from '@/components/atoms/ErrorBoundary';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LegalError({ error, reset }: Readonly<ErrorProps>) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Legal'
      message='We encountered an error loading this document. Please try again or contact support@meetjovie.com if the issue persists.'
    />
  );
}
