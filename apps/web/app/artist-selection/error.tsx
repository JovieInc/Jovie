'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function ArtistSelectionError({
  error,
  reset,
}: Readonly<ErrorProps>) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='ArtistSelection'
      message='We encountered an error loading artist selection. Please try again.'
    />
  );
}
