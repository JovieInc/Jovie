'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundaryProvider';
import type { ErrorProps } from '@/types/common';

export default function WaitlistError({ error, reset }: ErrorProps) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Waitlist'
      message='We encountered an error. Please try again.'
    />
  );
}
