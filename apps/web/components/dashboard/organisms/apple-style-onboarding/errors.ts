/**
 * Error mapping utilities for onboarding submission.
 *
 * Extracts error handling logic to reduce cognitive complexity.
 */

export interface ErrorMappingResult {
  userMessage: string;
  shouldRedirectToSignIn?: boolean;
  redirectUrl?: string;
}

/**
 * Extracts error message from various error types.
 *
 * Server action errors in Next.js are serialized and may not be
 * actual Error instances. This function handles:
 * - Error instances
 * - Serialized errors (objects with message property)
 * - String errors
 * - Unknown values
 *
 * @param error - The error to extract message from
 * @returns The error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    // Handle serialized errors from Next.js server actions
    const errorObj = error as Record<string, unknown>;
    if (typeof errorObj.message === 'string') {
      return errorObj.message;
    }
    // Some errors have a digest property but no message in production
    if (typeof errorObj.digest === 'string') {
      return 'An error occurred';
    }
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

/**
 * Maps error messages to user-friendly messages and actions.
 *
 * @param error - The error object from submission
 * @param redirectUrl - URL to redirect to for sign-in
 * @returns User message and optional redirect information
 */
export function mapErrorToUserMessage(
  error: unknown,
  redirectUrl: string
): ErrorMappingResult {
  const errorMessage = getErrorMessage(error);
  const message = errorMessage.toUpperCase();
  const errorCode = extractErrorCode(error);

  // Invalid session - needs refresh
  if (message.includes('INVALID_SESSION')) {
    return {
      userMessage: 'Could not save. Please refresh and try again.',
    };
  }

  // Username conflicts
  if (message.includes('USERNAME_TAKEN')) {
    return {
      userMessage: 'Not available. Try another handle.',
    };
  }

  // Email already in use - redirect to sign in
  if (message.includes('EMAIL_IN_USE')) {
    return {
      userMessage:
        'This email is already in use. Please sign in with the original account or use a different email.',
      shouldRedirectToSignIn: true,
      redirectUrl,
    };
  }

  // Rate limiting
  if (
    message.includes('RATE_LIMITED') ||
    message.includes('TOO_MANY_ATTEMPTS')
  ) {
    return {
      userMessage: 'Too many attempts. Please try again in a few moments.',
    };
  }

  if (
    errorCode === 'DATABASE_ERROR' ||
    errorCode === 'TRANSACTION_FAILED' ||
    errorCode === 'CONSTRAINT_VIOLATION'
  ) {
    return {
      userMessage:
        "We couldn't finish setting up your account. Please try again in a moment.",
    };
  }

  // Username validation errors
  if (
    message.includes('INVALID_USERNAME') ||
    message.includes('USERNAME_RESERVED') ||
    message.includes('USERNAME_INVALID_FORMAT') ||
    message.includes('USERNAME_TOO_SHORT') ||
    message.includes('USERNAME_TOO_LONG')
  ) {
    return {
      userMessage: "That handle can't be used. Try another one.",
    };
  }

  // Display name required
  if (message.includes('DISPLAY_NAME_REQUIRED')) {
    return {
      userMessage: 'Please enter your name to continue.',
    };
  }

  // Default error message
  let userMessage = 'Could not save. Please try again.';

  // In development, include error code if available
  if (process.env.NODE_ENV === 'development') {
    const errorCodeMatch = errorMessage.match(/^\[([A-Z_]+)\]/);
    const errorCode = errorCodeMatch?.[1];
    if (errorCode) {
      userMessage = `Could not save (${errorCode}). Please try again.`;
    }
  }

  return { userMessage };
}

/**
 * Extracts error code from error message.
 *
 * @param error - The error object
 * @returns Error code if found, undefined otherwise
 */
export function extractErrorCode(error: unknown): string | undefined {
  const message = getErrorMessage(error);
  if (message === 'Unknown error' || message === 'An error occurred') {
    return undefined;
  }
  const match = message.match(/\[([A-Z_]+)\]/);
  return match?.[1];
}

/**
 * Checks if error is a database error that needs retry.
 *
 * @param error - The error object
 * @returns True if database error
 */
export function isDatabaseError(error: unknown): boolean {
  const errorCode = extractErrorCode(error);
  if (errorCode) {
    return (
      errorCode === 'DATABASE_ERROR' ||
      errorCode === 'TRANSACTION_FAILED' ||
      errorCode === 'CONSTRAINT_VIOLATION' ||
      errorCode === 'NETWORK_ERROR'
    );
  }

  const message = getErrorMessage(error).toUpperCase();
  return (
    message.includes('DATABASE_ERROR') ||
    message.includes('TRANSACTION_FAILED') ||
    message.includes('CONSTRAINT_VIOLATION') ||
    message.includes('NETWORK_ERROR')
  );
}
