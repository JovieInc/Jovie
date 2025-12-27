'use client';

import { useToast } from '@/components/molecules/ToastContainer';
import { createScopedLogger } from '@/lib/utils/logger';
import {
  createErrorToast,
  createGenericErrorToast,
  createInfoToast,
  createNetworkErrorToast,
  createRetryToast,
  createSaveErrorToast,
  createSaveSuccessToast,
  createSuccessToast,
  createUndoToast,
  createUploadErrorToast,
  createUploadSuccessToast,
  createWarningToast,
  getUserFriendlyErrorMessage,
  isUserFacingError,
  type ToastUtilOptions,
} from '@/lib/utils/toast-utils';

const log = createScopedLogger('Notifications');

/**
 * Enhanced notification hook that provides convenient methods for common toast patterns
 * This is the recommended way to show notifications throughout the application
 */
export const useNotifications = () => {
  const { showToast, hideToast, clearToasts } = useToast();

  return {
    // Core toast methods
    showToast,
    hideToast,
    clearToasts,

    // Convenience methods with consistent styling
    success: (message: string, options?: ToastUtilOptions) => {
      return showToast(createSuccessToast(message, options));
    },

    error: (message: string, options?: ToastUtilOptions) => {
      return showToast(createErrorToast(message, options));
    },

    info: (message: string, options?: ToastUtilOptions) => {
      return showToast(createInfoToast(message, options));
    },

    warning: (message: string, options?: ToastUtilOptions) => {
      return showToast(createWarningToast(message, options));
    },

    // Action-based toasts
    undo: (
      message: string,
      onUndo: () => void,
      options?: Omit<ToastUtilOptions, 'action'>
    ) => {
      return showToast(createUndoToast(message, onUndo, options));
    },

    retry: (
      message: string,
      onRetry: () => void,
      options?: Omit<ToastUtilOptions, 'action'>
    ) => {
      return showToast(createRetryToast(message, onRetry, options));
    },

    // Common patterns
    saveSuccess: (options?: ToastUtilOptions) => {
      return showToast(createSaveSuccessToast(options));
    },

    saveError: (options?: ToastUtilOptions) => {
      return showToast(createSaveErrorToast(options));
    },

    uploadSuccess: (options?: ToastUtilOptions) => {
      return showToast(createUploadSuccessToast(options));
    },

    uploadError: (options?: ToastUtilOptions) => {
      return showToast(createUploadErrorToast(options));
    },

    networkError: (options?: ToastUtilOptions) => {
      return showToast(createNetworkErrorToast(options));
    },

    genericError: (options?: ToastUtilOptions) => {
      return showToast(createGenericErrorToast(options));
    },

    // Error handling helper
    handleError: (error: unknown, fallbackMessage?: string) => {
      if (isUserFacingError(error)) {
        const message = getUserFriendlyErrorMessage(error);
        return showToast(createErrorToast(fallbackMessage || message));
      }

      // Log technical errors but don't show to user
      log.error('Technical error', { error });

      if (fallbackMessage) {
        return showToast(createErrorToast(fallbackMessage));
      }

      return null;
    },

    // Async operation helpers
    withLoadingToast: async <T>(
      promise: Promise<T>,
      {
        loadingMessage = 'Processing...',
        successMessage,
        errorMessage,
      }: {
        loadingMessage?: string;
        successMessage?: string;
        errorMessage?: string;
      } = {}
    ): Promise<T> => {
      const loadingToastId = showToast(
        createInfoToast(loadingMessage, { duration: 0 })
      );

      try {
        const result = await promise;
        hideToast(loadingToastId);

        if (successMessage) {
          showToast(createSuccessToast(successMessage));
        }

        return result;
      } catch (error) {
        hideToast(loadingToastId);

        if (errorMessage) {
          showToast(createErrorToast(errorMessage));
        } else if (isUserFacingError(error)) {
          showToast(createErrorToast(getUserFriendlyErrorMessage(error)));
        }

        throw error;
      }
    },
  };
};

/**
 * Legacy alias for backward compatibility
 * @deprecated Use useNotifications instead
 */
export const useToastNotifications = useNotifications;
