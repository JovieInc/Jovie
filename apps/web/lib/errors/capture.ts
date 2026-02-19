import * as Sentry from '@sentry/nextjs';
import { getSentryMode, isSentryInitialized } from '@/lib/sentry/init';

/**
 * Capture an error in Sentry with SDK variant awareness.
 * Shared across ErrorBoundary implementations to avoid duplicated Sentry logic.
 */
export function captureErrorInSentry(
  error: Error,
  context: string,
  extra?: { componentStack?: string | null; digest?: string }
): void {
  const sentryMode = getSentryMode();
  const isInitialized = isSentryInitialized();

  if (isInitialized) {
    try {
      Sentry.captureException(error, {
        extra: {
          ...extra,
          sentryMode,
        },
        tags: {
          errorBoundary: context,
          sentryMode,
        },
      });
    } catch (sentryError) {
      console.error(`[${context}] Sentry capture failed:`, sentryError);
      console.error(`[${context}] Original error:`, error);
    }
  } else {
    console.error(`[${context}] Sentry not initialized, logging error:`, error);
  }
}

const TECHNICAL_ERRORS = [
  'Network request failed',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
];

/**
 * Check if an error should be shown to the user.
 */
export function isUserFacingError(error: unknown): boolean {
  if (typeof error === 'string') return true;
  if (error instanceof Error) {
    return !TECHNICAL_ERRORS.some(techError =>
      error.message.includes(techError)
    );
  }
  return false;
}

/**
 * Extract a user-friendly message from an error.
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    if (error.message.includes('fetch')) {
      return 'Network error. Please check your connection.';
    }
    if (error.message.includes('rate limit')) {
      return 'Too many requests. Please wait a moment.';
    }
    if (error.message.length < 100 && !error.message.includes('at ')) {
      return error.message;
    }
  }
  return 'Something went wrong. Please try again.';
}
