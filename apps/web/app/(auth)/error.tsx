'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundaryProvider';
import type { ErrorProps } from '@/types/common';

export default function AuthError({ error, reset }: ErrorProps) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Auth'
      message='We encountered an error during authentication. Please try again.'
    />
  );
}
