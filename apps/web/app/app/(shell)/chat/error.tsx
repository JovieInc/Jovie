'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundaryProvider';
import type { ErrorProps } from '@/types/common';

export default function ChatError({ error, reset }: ErrorProps) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Chat'
      message='We encountered an error loading chat. Please try again.'
    />
  );
}
