'use client';

import type { ToastOptions } from '@/components/molecules/ToastContainer';

/**
 * Utility functions for common toast patterns
 * Provides consistent messaging and styling across the application
 */

export interface ToastUtilOptions
  extends Omit<ToastOptions, 'type' | 'message'> {
  /** Override the default duration for this toast */
  duration?: number;
  /** Add an action button to the toast */
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Show a success toast with consistent styling and duration
 */
export const createSuccessToast = (
  message: string,
  options?: ToastUtilOptions
): ToastOptions => ({
  message,
  type: 'success',
  duration: 4000,
  ...options,
});

/**
 * Show an error toast with consistent styling and longer duration
 */
export const createErrorToast = (
  message: string,
  options?: ToastUtilOptions
): ToastOptions => ({
  message,
  type: 'error',
  duration: 6000,
  ...options,
});

/**
 * Show an info toast with consistent styling
 */
export const createInfoToast = (
  message: string,
  options?: ToastUtilOptions
): ToastOptions => ({
  message,
  type: 'info',
  duration: 4000,
  ...options,
});

/**
 * Show a warning toast with consistent styling
 */
export const createWarningToast = (
  message: string,
  options?: ToastUtilOptions
): ToastOptions => ({
  message,
  type: 'warning',
  duration: 5000,
  ...options,
});

/**
 * Common toast messages for consistent UX
 */
export const TOAST_MESSAGES = {
  // Success messages
  SAVE_SUCCESS: 'Changes saved successfully',
  UPLOAD_SUCCESS: 'Upload completed successfully',
  DELETE_SUCCESS: 'Item deleted successfully',
  COPY_SUCCESS: 'Copied to clipboard',

  // Error messages
  SAVE_ERROR: 'Failed to save changes. Please try again.',
  UPLOAD_ERROR: 'Upload failed. Please try again.',
  DELETE_ERROR: 'Failed to delete item. Please try again.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  GENERIC_ERROR: 'Something went wrong. Please try again.',

  // Validation errors
  REQUIRED_FIELD: 'Please fill in all required fields',
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_URL: 'Please enter a valid URL',
  FILE_TOO_LARGE: 'File size is too large',
  INVALID_FILE_TYPE: 'Invalid file type',

  // Info messages
  LOADING: 'Loading...',
  PROCESSING: 'Processing your request...',
  CHANGES_PENDING: 'You have unsaved changes',

  // Warning messages
  UNSAVED_CHANGES: 'You have unsaved changes that will be lost',
  RATE_LIMIT: 'Too many requests. Please wait a moment.',
  MAINTENANCE: 'System maintenance in progress',
} as const;

/**
 * Convenience functions using predefined messages
 */
export const createSaveSuccessToast = (options?: ToastUtilOptions) =>
  createSuccessToast(TOAST_MESSAGES.SAVE_SUCCESS, options);

export const createSaveErrorToast = (options?: ToastUtilOptions) =>
  createErrorToast(TOAST_MESSAGES.SAVE_ERROR, options);

export const createUploadSuccessToast = (options?: ToastUtilOptions) =>
  createSuccessToast(TOAST_MESSAGES.UPLOAD_SUCCESS, options);

export const createUploadErrorToast = (options?: ToastUtilOptions) =>
  createErrorToast(TOAST_MESSAGES.UPLOAD_ERROR, options);

export const createNetworkErrorToast = (options?: ToastUtilOptions) =>
  createErrorToast(TOAST_MESSAGES.NETWORK_ERROR, options);

export const createGenericErrorToast = (options?: ToastUtilOptions) =>
  createErrorToast(TOAST_MESSAGES.GENERIC_ERROR, options);

/**
 * Helper to create toast with undo functionality
 */
export const createUndoToast = (
  message: string,
  onUndo: () => void,
  options?: Omit<ToastUtilOptions, 'action'>
): ToastOptions => ({
  message,
  type: 'info',
  duration: 8000, // Longer duration for undo actions
  action: {
    label: 'Undo',
    onClick: onUndo,
  },
  ...options,
});

/**
 * Helper to create toast with retry functionality
 */
export const createRetryToast = (
  message: string,
  onRetry: () => void,
  options?: Omit<ToastUtilOptions, 'action'>
): ToastOptions => ({
  message,
  type: 'error',
  duration: 8000, // Longer duration for retry actions
  action: {
    label: 'Retry',
    onClick: onRetry,
  },
  ...options,
});

/**
 * Type guard to check if an error should be shown to the user
 */
export const isUserFacingError = (error: unknown): boolean => {
  if (typeof error === 'string') {
    return true;
  }

  if (error instanceof Error) {
    // Don't show technical errors to users
    const technicalErrors = [
      'Network request failed',
      'TypeError',
      'ReferenceError',
      'SyntaxError',
    ];

    return !technicalErrors.some(techError =>
      error.message.includes(techError)
    );
  }

  return false;
};

/**
 * Extract user-friendly message from error
 */
export const getUserFriendlyErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    // Map common error patterns to user-friendly messages
    if (error.message.includes('fetch')) {
      return TOAST_MESSAGES.NETWORK_ERROR;
    }

    if (error.message.includes('rate limit')) {
      return TOAST_MESSAGES.RATE_LIMIT;
    }

    // Return the error message if it seems user-friendly
    if (error.message.length < 100 && !error.message.includes('at ')) {
      return error.message;
    }
  }

  return TOAST_MESSAGES.GENERIC_ERROR;
};
