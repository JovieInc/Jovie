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
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const message = errorMessage.toUpperCase();

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
    const errorCodeMatch =
      error instanceof Error ? error.message.match(/^\[([A-Z_]+)\]/) : null;
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
  if (!(error instanceof Error)) return undefined;
  const match = error.message.match(/^\[([A-Z_]+)\]/);
  return match?.[1];
}

/**
 * Checks if error is a database error that needs retry.
 *
 * @param error - The error object
 * @returns True if database error
 */
export function isDatabaseError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  return errorMessage.includes('DATABASE_ERROR');
}
