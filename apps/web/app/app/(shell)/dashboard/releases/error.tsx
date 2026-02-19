'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundaryProvider';
import type { ErrorProps } from '@/types/common';

export default function ReleasesError({ error, reset }: ErrorProps) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Releases'
      message='We encountered an error loading your releases. Please try again.'
    />
  );
}
