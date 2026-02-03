'use client';

import ErrorBoundary from '@/components/atoms/ErrorBoundary';

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function AppError({ error, reset }: Readonly<ErrorProps>) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='App'
      message="We hit a wrong note. Don't worry, give it another go!"
    />
  );
}
