'use client';

import { useEffect } from 'react';
import ErrorBoundary from '@/components/atoms/ErrorBoundary';

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function MarketingError({ error, reset }: Readonly<ErrorProps>) {
  useEffect(() => {
    // Detect and log database-related errors for better debugging
    const isDatabaseError =
      error.message.includes('database') ||
      error.message.includes('timeout') ||
      error.message.includes('connection') ||
      error.message.includes('query');

    if (isDatabaseError) {
      console.error('[Marketing] Database-related error detected:', {
        message: error.message,
        digest: error.digest,
        stack: error.stack?.slice(0, 500), // First 500 chars of stack
      });
    }
  }, [error]);

  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Marketing'
      message="This page missed a beat. Don't worry, hit replay and try again!"
    />
  );
}
