'use client';

import ErrorBoundary from '@/components/organisms/ErrorBoundary';

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function ChatError({ error, reset }: Readonly<ErrorProps>) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Chat'
      message='We encountered an error loading chat. Please try again.'
    />
  );
}
