'use client';

import ErrorBoundary from '@/components/atoms/ErrorBoundary';

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function LegalError({ error, reset }: Readonly<ErrorProps>) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Legal'
      message="This document took an unexpected break. Try again, or reach out to support@meetjovie.com if it keeps playing hide and seek!"
    />
  );
}
