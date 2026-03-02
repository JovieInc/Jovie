/**
 * Shared mutation utilities for consistent error handling and toasts.
 *
 * Use these utilities with React Query mutations to ensure consistent
 * error handling and user feedback across the app.
 */

import * as Sentry from '@sentry/nextjs';
import { toast } from 'sonner';
import { FetchError } from './fetch';

/**
 * Heuristic: returns true when a message looks like a raw/technical error
 * that should NOT be shown to end users (stack traces, HTTP noise, etc.).
 */
function isTechnicalError(message: string): boolean {
  // Stack-trace markers or very long messages
  if (message.includes(' at ') || message.length > 200) return true;
  // HTTP/network noise
  if (/^(fetch|network|ECONNRE|ETIMEDOUT|socket)/i.test(message)) return true;
  // JSON parse errors
  if (/unexpected token/i.test(message)) return true;
  return false;
}

/**
 * Extract a user-friendly error message from various error types.
 *
 * Raw / technical error strings are never surfaced to the user.
 * They are replaced with the caller-provided fallback while the
 * original message is preserved for console + Sentry (JOV-1088).
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof FetchError) {
    // Use status-specific messages for common errors
    if (error.status === 401) return 'Please sign in to continue.';
    if (error.status === 403) return 'You do not have permission to do this.';
    if (error.status === 404) return 'The requested resource was not found.';
    if (error.status === 409)
      return 'This was modified elsewhere. Please refresh.';
    if (error.status === 429)
      return 'Too many requests. Please try again later.';
    if (error.status >= 500) return 'Something went wrong. Please try again.';
  }

  if (error instanceof Error && error.message) {
    // Only surface messages that look user-friendly; hide technical noise
    if (isTechnicalError(error.message)) {
      // Keep the raw detail for debugging
      console.error('[mutation error]', error.message);
      return fallback;
    }
    return error.message;
  }

  return fallback;
}

/**
 * Handle mutation errors with toast notification.
 *
 * @example
 * useMutation({
 *   mutationFn: updateProfile,
 *   onError: (error) => handleMutationError(error, 'Failed to update profile'),
 * });
 */
export function handleMutationError(
  error: unknown,
  fallbackMessage: string,
  context?: Record<string, unknown>
): void {
  const message = getErrorMessage(error, fallbackMessage);
  toast.error(message);

  // Always log the raw error for debugging (never swallow details)
  console.error('[handleMutationError]', fallbackMessage, error);

  // Capture mutation errors in Sentry (production + development)
  Sentry.captureException(error, {
    tags: {
      category: 'mutation',
      source: 'handleMutationError',
    },
    extra: {
      fallbackMessage,
      userMessage: message,
      ...context,
    },
  });

  // Add breadcrumb for error trail
  Sentry.addBreadcrumb({
    category: 'mutation',
    message: `Mutation Error: ${fallbackMessage}`,
    level: 'error',
    data: { error: error instanceof Error ? error.message : String(error) },
  });
}

/**
 * Handle mutation success with toast notification.
 *
 * @example
 * useMutation({
 *   mutationFn: updateProfile,
 *   onSuccess: () => handleMutationSuccess('Profile updated'),
 * });
 */
export function handleMutationSuccess(message: string): void {
  toast.success(message);
}

/**
 * Options for creating standard mutation callbacks.
 */
export interface MutationCallbackOptions {
  /** Message to show on success */
  successMessage?: string;
  /** Message to show on error (fallback if error has no message) */
  errorMessage: string;
  /** Called after success toast */
  onSuccess?: () => void;
  /** Called after error toast */
  onError?: (error: unknown) => void;
}

/**
 * Create standard mutation callbacks for onSuccess and onError.
 *
 * @example
 * const callbacks = createMutationCallbacks({
 *   successMessage: 'Settings saved',
 *   errorMessage: 'Failed to save settings',
 * });
 *
 * useMutation({
 *   mutationFn: saveSettings,
 *   ...callbacks,
 * });
 */
export function createMutationCallbacks(options: MutationCallbackOptions) {
  return {
    onSuccess: () => {
      if (options.successMessage) {
        handleMutationSuccess(options.successMessage);
      }
      options.onSuccess?.();
    },
    onError: (error: unknown) => {
      handleMutationError(error, options.errorMessage);
      options.onError?.(error);
    },
  };
}
