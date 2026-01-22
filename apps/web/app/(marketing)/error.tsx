'use client';

import { useEffect } from 'react';
import ErrorBoundary from '@/components/atoms/ErrorBoundary';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MarketingError({ error, reset }: ErrorProps) {
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
      message={'We encountered an error loading this page. Please try again.'}
    />
  );
}
