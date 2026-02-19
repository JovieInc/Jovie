'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';
import type { ErrorProps } from '@/types/common';

export default function ArtistSelectionError({ error, reset }: ErrorProps) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='ArtistSelection'
      message='We encountered an error loading artist selection. Please try again.'
    />
  );
}
