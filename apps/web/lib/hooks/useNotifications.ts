'use client';

import { useCallback, useMemo } from 'react';
import { type ExternalToast, toast } from 'sonner';

/**
 * Standard toast messages for consistent UX across the application
 */
export const TOAST_MESSAGES = {
  // Success messages
  SAVE_SUCCESS: 'Changes saved',
  UPLOAD_SUCCESS: 'Upload complete',
  DELETE_SUCCESS: 'Deleted successfully',
  COPY_SUCCESS: 'Copied to clipboard',
  SEND_SUCCESS: 'Sent successfully',

  // Error messages
  SAVE_ERROR: 'Failed to save. Please try again.',
  UPLOAD_ERROR: 'Upload failed. Please try again.',
  DELETE_ERROR: 'Failed to delete. Please try again.',
  COPY_ERROR: 'Failed to copy',
  NETWORK_ERROR: 'Network error. Check your connection.',
  GENERIC_ERROR: 'Something went wrong. Please try again.',
  PERMISSION_ERROR: "You don't have permission to do that.",
  SESSION_EXPIRED: 'Your session expired. Please sign in again.',

  // Validation errors
  REQUIRED_FIELD: 'Please fill in all required fields',
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_URL: 'Please enter a valid URL',
  FILE_TOO_LARGE: 'File is too large',
  INVALID_FILE_TYPE: 'Invalid file type',

  // Info messages
  LOADING: 'Loading...',
  PROCESSING: 'Processing...',
  SAVING: 'Saving...',
  UPLOADING: 'Uploading...',

  // Warning messages
  UNSAVED_CHANGES: 'You have unsaved changes',
  RATE_LIMIT: 'Too many requests. Please wait.',
  OFFLINE: 'You appear to be offline',

  // Version update messages
  VERSION_UPDATE: 'A new version is available',
  VERSION_UPDATE_DESCRIPTION: 'Refresh to get the latest features and fixes.',
  CHUNK_ERROR: 'The app has been updated',
  CHUNK_ERROR_DESCRIPTION: 'Please refresh to continue.',
} as const;

/**
 * Duration presets for different toast types (in milliseconds)
 */
export const TOAST_DURATIONS = {
  /** Quick confirmation (2s) - for instant actions like copy */
  SHORT: 2000,
  /** Standard duration (4s) - for success messages */
  DEFAULT: 4000,
  /** Medium duration (5s) - for warnings */
  MEDIUM: 5000,
  /** Longer duration (6s) - for errors that need reading */
  LONG: 6000,
  /** Extended duration (8s) - for action toasts (undo, retry) */
  ACTION: 8000,
  /** Persistent until dismissed - for loading states */
  PERSISTENT: Infinity,
} as const;

/**
 * Options for toast notifications (extends Sonner's ExternalToast)
 */
export interface ToastOptions extends ExternalToast {
  // All options inherited from ExternalToast
}

/**
 * Options for action toasts (with Undo/Retry buttons)
 */
export interface ActionToastOptions extends Omit<ToastOptions, 'action'> {
  /** Label for the action button (defaults to 'Undo' or 'Retry') */
  actionLabel?: string;
}

/**
 * Options for promise toasts
 */
export interface PromiseToastOptions<T> {
  loading?: string;
  success?: string | ((data: T) => string);
  error?: string | ((error: unknown) => string);
}

/**
 * World-class notification hook powered by Sonner
 *
 * Provides a comprehensive API for toast notifications with:
 * - Convenience methods for common patterns (success, error, warning, info)
 * - Action toasts with Undo/Retry functionality
 * - Promise toasts for async operations
 * - Loading state management
 * - Consistent styling and messaging
 *
 * @example
 * ```tsx
 * const notify = useNotifications();
 *
 * // Simple notifications
 * notify.success('Profile saved');
 * notify.error('Failed to save');
 * notify.warning('Session expiring soon');
 * notify.info('New features available');
 *
 * // Action toasts
 * notify.undo('Item deleted', () => restoreItem());
 * notify.retry('Upload failed', () => retryUpload());
 *
 * // Promise toast (shows loading → success/error)
 * notify.promise(saveProfile(data), {
 *   loading: 'Saving profile...',
 *   success: 'Profile saved!',
 *   error: 'Failed to save profile',
 * });
 *
 * // Copy to clipboard
 * notify.copySuccess();
 * notify.copyError();
 *
 * // Common patterns
 * notify.saveSuccess();
 * notify.saveError();
 * notify.uploadSuccess();
 * notify.uploadError();
 * notify.deleteSuccess();
 * notify.deleteError();
 * ```
 */
export function useNotifications() {
  // Success toast - short duration for quick confirmation
  const success = useCallback(
    (message: string, options?: ToastOptions): string | number => {
      return toast.success(message, {
        duration: TOAST_DURATIONS.DEFAULT,
        ...options,
      });
    },
    []
  );

  // Error toast - longer duration for reading
  const error = useCallback(
    (message: string, options?: ToastOptions): string | number => {
      return toast.error(message, {
        duration: TOAST_DURATIONS.LONG,
        ...options,
      });
    },
    []
  );

  // Warning toast - medium duration
  const warning = useCallback(
    (message: string, options?: ToastOptions): string | number => {
      return toast.warning(message, {
        duration: TOAST_DURATIONS.MEDIUM,
        ...options,
      });
    },
    []
  );

  // Info toast - standard duration
  const info = useCallback(
    (message: string, options?: ToastOptions): string | number => {
      return toast.info(message, {
        duration: TOAST_DURATIONS.DEFAULT,
        ...options,
      });
    },
    []
  );

  // Loading toast - persists until dismissed
  const loading = useCallback(
    (message: string, options?: ToastOptions): string | number => {
      return toast.loading(message, {
        duration: TOAST_DURATIONS.PERSISTENT,
        ...options,
      });
    },
    []
  );

  // Dismiss a specific toast or all toasts
  const dismiss = useCallback((toastId?: string | number): void => {
    toast.dismiss(toastId);
  }, []);

  // Undo action toast
  const undo = useCallback(
    (
      message: string,
      onUndo: () => void,
      options?: ActionToastOptions
    ): string | number => {
      const { actionLabel, ...toastOptions } = options ?? {};
      return toast(message, {
        duration: TOAST_DURATIONS.ACTION,
        action: {
          label: actionLabel ?? 'Undo',
          onClick: onUndo,
        },
        ...toastOptions,
      });
    },
    []
  );

  // Retry action toast
  const retry = useCallback(
    (
      message: string,
      onRetry: () => void,
      options?: ActionToastOptions
    ): string | number => {
      const { actionLabel, ...toastOptions } = options ?? {};
      return toast.error(message, {
        duration: TOAST_DURATIONS.ACTION,
        action: {
          label: actionLabel ?? 'Retry',
          onClick: onRetry,
        },
        ...toastOptions,
      });
    },
    []
  );

  // Promise toast - shows loading → success/error
  const promiseToast = useCallback(
    <T>(promise: Promise<T>, options?: PromiseToastOptions<T>): Promise<T> => {
      toast.promise(promise, {
        loading: options?.loading ?? TOAST_MESSAGES.PROCESSING,
        success: options?.success ?? TOAST_MESSAGES.SAVE_SUCCESS,
        error: options?.error ?? TOAST_MESSAGES.GENERIC_ERROR,
      });
      return promise;
    },
    []
  );

  // --- Common Pattern Shortcuts ---

  // Save operations
  const saveSuccess = useCallback(
    (options?: ToastOptions): string | number => {
      return success(TOAST_MESSAGES.SAVE_SUCCESS, options);
    },
    [success]
  );

  const saveError = useCallback(
    (options?: ToastOptions): string | number => {
      return error(TOAST_MESSAGES.SAVE_ERROR, options);
    },
    [error]
  );

  // Upload operations
  const uploadSuccess = useCallback(
    (options?: ToastOptions): string | number => {
      return success(TOAST_MESSAGES.UPLOAD_SUCCESS, options);
    },
    [success]
  );

  const uploadError = useCallback(
    (options?: ToastOptions): string | number => {
      return error(TOAST_MESSAGES.UPLOAD_ERROR, options);
    },
    [error]
  );

  // Delete operations
  const deleteSuccess = useCallback(
    (options?: ToastOptions): string | number => {
      return success(TOAST_MESSAGES.DELETE_SUCCESS, options);
    },
    [success]
  );

  const deleteError = useCallback(
    (options?: ToastOptions): string | number => {
      return error(TOAST_MESSAGES.DELETE_ERROR, options);
    },
    [error]
  );

  // Copy operations
  const copySuccess = useCallback(
    (options?: ToastOptions): string | number => {
      return success(TOAST_MESSAGES.COPY_SUCCESS, {
        duration: TOAST_DURATIONS.SHORT,
        ...options,
      });
    },
    [success]
  );

  const copyError = useCallback(
    (options?: ToastOptions): string | number => {
      return error(TOAST_MESSAGES.COPY_ERROR, options);
    },
    [error]
  );

  // Network error
  const networkError = useCallback(
    (options?: ToastOptions): string | number => {
      return error(TOAST_MESSAGES.NETWORK_ERROR, options);
    },
    [error]
  );

  // Generic error
  const genericError = useCallback(
    (options?: ToastOptions): string | number => {
      return error(TOAST_MESSAGES.GENERIC_ERROR, options);
    },
    [error]
  );

  // Handle unknown errors intelligently
  const handleError = useCallback(
    (err: unknown, fallbackMessage?: string): string | number => {
      // Extract message from error
      let message = fallbackMessage ?? TOAST_MESSAGES.GENERIC_ERROR;

      if (typeof err === 'string') {
        message = err;
      } else if (err instanceof Error) {
        // Don't show technical errors to users - check error.name instead of message
        const technicalErrorNames = new Set([
          'TypeError',
          'ReferenceError',
          'SyntaxError',
        ]);
        const isTechnicalError =
          technicalErrorNames.has(err.name) ||
          err.message?.includes('at ') ||
          (err.message && err.message.length > 100);

        if (!isTechnicalError && err.message) {
          message = err.message;
        }

        // Map common error patterns (safely check message exists)
        if (err.message) {
          const lowerMessage = err.message.toLowerCase();
          if (lowerMessage.includes('network')) {
            message = TOAST_MESSAGES.NETWORK_ERROR;
          } else if (lowerMessage.includes('rate limit')) {
            message = TOAST_MESSAGES.RATE_LIMIT;
          } else if (lowerMessage.includes('permission')) {
            message = TOAST_MESSAGES.PERMISSION_ERROR;
          } else if (lowerMessage.includes('session')) {
            message = TOAST_MESSAGES.SESSION_EXPIRED;
          }
        }
      }

      return error(message);
    },
    [error]
  );

  return useMemo(
    () => ({
      // Core methods
      success,
      error,
      warning,
      info,
      loading,
      dismiss,

      // Action toasts
      undo,
      retry,

      // Promise toast
      promise: promiseToast,

      // Common shortcuts
      saveSuccess,
      saveError,
      uploadSuccess,
      uploadError,
      deleteSuccess,
      deleteError,
      copySuccess,
      copyError,
      networkError,
      genericError,

      // Error handling
      handleError,

      // Direct access to toast for advanced use cases
      toast,

      // Message constants for custom usage
      messages: TOAST_MESSAGES,
      durations: TOAST_DURATIONS,
    }),
    [
      success,
      error,
      warning,
      info,
      loading,
      dismiss,
      undo,
      retry,
      promiseToast,
      saveSuccess,
      saveError,
      uploadSuccess,
      uploadError,
      deleteSuccess,
      deleteError,
      copySuccess,
      copyError,
      networkError,
      genericError,
      handleError,
    ]
  );
}

/**
 * Re-export toast for direct usage without the hook
 * Use this when you don't need the convenience methods
 *
 * @example
 * ```tsx
 * import { toast } from '@/lib/hooks/useNotifications';
 * toast.success('Done!');
 * ```
 */
export { toast };
