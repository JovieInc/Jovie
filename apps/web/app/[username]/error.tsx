'use client';

import { useEffect } from 'react';
import ErrorBoundary from '@/components/atoms/ErrorBoundary';

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

/**
 * Error boundary for profile pages.
 * Handles database errors, timeouts, and other failures gracefully.
 */
export default function ProfileError({ error, reset }: Readonly<ErrorProps>) {
  useEffect(() => {
    // Detect and log database-related errors for better debugging
    const isDatabaseError =
      error.message.includes('database') ||
      error.message.includes('timeout') ||
      error.message.includes('connection') ||
      error.message.includes('query') ||
      error.message.includes('profile');

    if (isDatabaseError) {
      console.error('[Profile] Database-related error detected:', {
        message: error.message,
        digest: error.digest,
        stack: error.stack?.slice(0, 500),
      });
    }
  }, [error]);

  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      context='Profile'
      message="This profile is being a bit shy right now. Don't worry, try again in a sec!"
    />
  );
}
