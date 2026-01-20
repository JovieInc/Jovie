/**
 * Shared mutation utilities for consistent error handling and toasts.
 *
 * Use these utilities with React Query mutations to ensure consistent
 * error handling and user feedback across the app.
 */

import { toast } from 'sonner';
import { FetchError } from './fetch';

/**
 * Extract a user-friendly error message from various error types.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof FetchError) {
    // Use status-specific messages for common errors
    if (error.status === 401) return 'Please sign in to continue';
    if (error.status === 403) return 'You do not have permission to do this';
    if (error.status === 404) return 'The requested resource was not found';
    if (error.status === 409) return 'This was modified elsewhere. Please refresh.';
    if (error.status === 429) return 'Too many requests. Please try again later.';
    if (error.status >= 500) return 'Something went wrong. Please try again.';
  }

  if (error instanceof Error && error.message) {
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
export function handleMutationError(error: unknown, fallbackMessage: string): void {
  const message = getErrorMessage(error, fallbackMessage);
  toast.error(message);

  // Log for debugging in development
  if (process.env.NODE_ENV === 'development') {
    console.error(`[Mutation Error] ${fallbackMessage}:`, error);
  }
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
