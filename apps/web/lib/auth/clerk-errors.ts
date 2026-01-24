import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import * as Sentry from '@sentry/nextjs';

/**
 * Clerk API error codes mapped to user-friendly messages.
 * These are the most common errors encountered during auth flows.
 */
const CLERK_ERROR_MESSAGES: Record<string, string> = {
  // Sign-in errors
  form_identifier_not_found:
    "We couldn't find an account with that email. Would you like to sign up instead?",
  form_password_incorrect: 'Incorrect password. Please try again.',
  form_code_incorrect: 'That code is incorrect. Please check and try again.',
  verification_expired:
    'Your verification code has expired. Please request a new one.',
  verification_failed: 'Verification failed. Please try again.',

  // Sign-up errors
  form_identifier_exists:
    'An account with this email already exists. Try signing in instead.',
  form_email_address_blocked: 'This email address is not allowed.',

  // Rate limiting
  too_many_requests: 'Too many attempts. Please wait a moment and try again.',
  rate_limit_exceeded: 'Too many requests. Please wait before trying again.',

  // Bot protection / CAPTCHA errors
  captcha_invalid: 'Verification failed. Please try again.',
  captcha_not_enabled: 'Please try again.',
  captcha_missing:
    'Please disable ad blockers or try a different browser, then refresh the page.',
  captcha_unavailable:
    'Verification is temporarily unavailable. Please try again or use a different sign-in method.',
  bot_traffic_detected:
    'Unable to verify your request. Please try again or use a different browser.',

  // OAuth errors
  external_account_not_found:
    'No account found with this provider. Please sign up first.',
  external_account_exists: 'This account is already linked to another user.',
  oauth_access_denied: 'Access was denied. Please try again.',
  oauth_callback_error:
    'Something went wrong with the sign-in. Please try again.',

  // Session errors
  session_exists: 'You are already signed in.',
  not_allowed_access:
    'Access denied. Please contact support if this continues.',

  // Generic errors
  form_param_nil: 'Please fill in all required fields.',
  form_param_format_invalid: 'Please check your input and try again.',
};

/**
 * Parse a Clerk API error into a user-friendly message.
 * Handles ClerkAPIResponseError and unknown error types.
 */
export function parseClerkError(error: unknown): string {
  if (isClerkAPIResponseError(error)) {
    const firstError = error.errors[0];
    if (!firstError) {
      return 'An unexpected error occurred. Please try again.';
    }

    const code = firstError.code;
    const customMessage = CLERK_ERROR_MESSAGES[code];

    if (customMessage) {
      return customMessage;
    }

    // Fall back to Clerk's message if we don't have a custom one
    if (firstError.longMessage) {
      return firstError.longMessage;
    }
    if (firstError.message) {
      return firstError.message;
    }

    return 'An unexpected error occurred. Please try again.';
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    // Don't expose internal error messages to users
    Sentry.captureException(error, {
      tags: { context: 'clerk_auth_error' },
    });
    return 'An unexpected error occurred. Please try again.';
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Check if an error indicates the user should sign up instead
 */
export function isSignUpSuggested(error: unknown): boolean {
  if (isClerkAPIResponseError(error)) {
    const code = error.errors[0]?.code;
    return code === 'form_identifier_not_found';
  }
  return false;
}

/**
 * Check if an error indicates the user should sign in instead
 */
export function isSignInSuggested(error: unknown): boolean {
  if (isClerkAPIResponseError(error)) {
    const code = error.errors[0]?.code;
    return code === 'form_identifier_exists';
  }
  return false;
}

/**
 * Check if an error is due to rate limiting
 */
export function isRateLimited(error: unknown): boolean {
  if (isClerkAPIResponseError(error)) {
    const code = error.errors[0]?.code;
    return code === 'too_many_requests' || code === 'rate_limit_exceeded';
  }
  return false;
}

/**
 * Check if the verification code has expired
 */
export function isCodeExpired(error: unknown): boolean {
  if (isClerkAPIResponseError(error)) {
    const code = error.errors[0]?.code;
    return code === 'verification_expired';
  }
  return false;
}

/**
 * Check if a session already exists (user is already signed in)
 */
export function isSessionExists(error: unknown): boolean {
  if (isClerkAPIResponseError(error)) {
    const code = error.errors[0]?.code;
    return code === 'session_exists';
  }
  return false;
}
