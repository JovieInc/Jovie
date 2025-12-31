import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  calculateBackoffDelay,
  type UseFormStateOptions,
} from './useFormState';

/**
 * Configuration for an optimistic mutation.
 *
 * @typeParam TData - The type of data returned by the mutation
 * @typeParam TVariables - The type of variables passed to the mutation function
 *
 * @example
 * const config: OptimisticMutationConfig<Profile, { displayName: string }> = {
 *   mutationFn: async (variables) => {
 *     const res = await fetch('/api/profile', {
 *       method: 'PUT',
 *       body: JSON.stringify(variables)
 *     });
 *     return res.json();
 *   },
 *   onOptimisticUpdate: (variables) => {
 *     setProfile(prev => ({ ...prev, ...variables }));
 *   },
 *   onRollback: () => {
 *     setProfile(serverProfile);
 *   }
 * };
 */
export interface OptimisticMutationConfig<TData, TVariables> {
  /**
   * The mutation function to execute.
   * Should perform the server-side update and return the result.
   *
   * @param variables - The variables to pass to the mutation
   * @param signal - AbortSignal for cancellation support
   * @returns Promise that resolves to the mutation result
   */
  mutationFn: (variables: TVariables, signal: AbortSignal) => Promise<TData>;

  /**
   * Callback invoked immediately when mutation is triggered, before the server request.
   * Use this to update local state optimistically.
   *
   * @param variables - The variables passed to the mutation
   *
   * @example
   * onOptimisticUpdate: (enabled) => {
   *   setMarketingEmails(enabled); // Update UI immediately
   * }
   */
  onOptimisticUpdate: (variables: TVariables) => void;

  /**
   * Callback invoked when the mutation fails after all retries are exhausted.
   * Use this to rollback the optimistic update.
   *
   * @example
   * onRollback: () => {
   *   setMarketingEmails(!enabled); // Revert to previous value
   * }
   */
  onRollback: () => void;

  /**
   * Optional callback invoked when the mutation succeeds.
   * Use this for side effects like showing success toasts or invalidating caches.
   *
   * @param data - The data returned by the mutation
   *
   * @example
   * onSuccess: (data) => {
   *   toast.success('Settings saved!');
   *   invalidateCache();
   * }
   */
  onSuccess?: (data: TData) => void;

  /**
   * Optional callback invoked when the mutation encounters an error.
   * Called before automatic retries and before onRollback.
   *
   * @param error - The error that occurred
   *
   * @example
   * onError: (error) => {
   *   console.error('Mutation failed:', error);
   * }
   */
  onError?: (error: Error) => void;

  /**
   * Optional retry configuration.
   * If not provided, uses default retry settings (3 retries, 1s base delay).
   */
  retryConfig?: UseFormStateOptions;

  /**
   * Whether to show toast notifications on success/error.
   * @default true
   */
  showToasts?: boolean;

  /**
   * Custom success toast message.
   * Only shown if showToasts is true.
   * If not provided, no success toast is shown (silent success).
   */
  successMessage?: string;

  /**
   * Custom error toast message.
   * Only shown if showToasts is true.
   * @default 'Failed to save. Please try again.'
   */
  errorMessage?: string;
}

/**
 * Return type of the useOptimisticMutation hook.
 *
 * @typeParam TData - The type of data returned by the mutation
 * @typeParam TVariables - The type of variables passed to the mutation function
 */
export interface UseOptimisticMutationReturn<TData, TVariables> {
  /**
   * Trigger the mutation with optimistic updates.
   *
   * @param variables - Variables to pass to the mutation function
   * @returns Promise that resolves to the mutation result
   *
   * @example
   * await mutate({ displayName: 'New Name' });
   */
  mutate: (variables: TVariables) => Promise<TData>;

  /**
   * Whether the mutation is currently in progress.
   */
  isLoading: boolean;

  /**
   * Error from the last failed mutation (after all retries exhausted).
   * Empty string when no error.
   */
  error: string;

  /**
   * Whether an automatic retry is currently in progress.
   */
  isRetrying: boolean;

  /**
   * Whether manual retry is available (all automatic retries exhausted).
   */
  canRetry: boolean;

  /**
   * Current retry attempt number (0-based).
   */
  retryAttempt: number;

  /**
   * Manually retry the last failed mutation.
   * Only available when canRetry is true.
   *
   * @returns Promise that resolves to the mutation result
   *
   * @example
   * {canRetry && <button onClick={retry}>Try Again</button>}
   */
  retry: () => Promise<TData>;

  /**
   * Cancel the current in-flight mutation and any pending retry.
   */
  cancel: () => void;

  /**
   * Reset all state to initial values.
   */
  reset: () => void;
}

/**
 * Default retry configuration for optimistic mutations.
 */
const DEFAULT_RETRY_CONFIG: UseFormStateOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
};

/**
 * A React hook for optimistic mutations with automatic rollback on error.
 *
 * Features:
 * - Immediate UI update via onOptimisticUpdate
 * - Automatic rollback on error via onRollback
 * - Auto-retry with exponential backoff (max 3 attempts by default)
 * - Toast notifications on success/failure
 * - Manual retry capability
 * - Request cancellation support
 *
 * @typeParam TData - The type of data returned by the mutation
 * @typeParam TVariables - The type of variables passed to the mutation function
 *
 * @param config - Configuration for the optimistic mutation
 * @returns An object containing the mutate function and state
 *
 * @example
 * // Settings toggle with optimistic update
 * function SettingsToggle() {
 *   const [enabled, setEnabled] = useState(false);
 *
 *   const { mutate, isLoading } = useOptimisticMutation({
 *     mutationFn: async (newValue: boolean) => {
 *       const res = await fetch('/api/settings', {
 *         method: 'PUT',
 *         body: JSON.stringify({ enabled: newValue })
 *       });
 *       if (!res.ok) throw new Error('Failed');
 *       return res.json();
 *     },
 *     onOptimisticUpdate: (newValue) => {
 *       setEnabled(newValue); // Update immediately
 *     },
 *     onRollback: () => {
 *       setEnabled(prev => !prev); // Revert on error
 *     },
 *     successMessage: 'Settings saved!'
 *   });
 *
 *   return (
 *     <Switch
 *       checked={enabled}
 *       onChange={(e) => mutate(e.target.checked)}
 *       disabled={isLoading}
 *     />
 *   );
 * }
 *
 * @example
 * // With manual retry button
 * function ProfileForm() {
 *   const { mutate, isLoading, error, canRetry, retry } = useOptimisticMutation({
 *     mutationFn: updateProfile,
 *     onOptimisticUpdate: (data) => setLocalProfile(data),
 *     onRollback: () => setLocalProfile(serverProfile),
 *   });
 *
 *   return (
 *     <>
 *       <button onClick={() => mutate(formData)} disabled={isLoading}>
 *         Save
 *       </button>
 *       {error && canRetry && (
 *         <button onClick={retry}>Try Again</button>
 *       )}
 *     </>
 *   );
 * }
 *
 * @example
 * // Handling version conflicts (409)
 * const { mutate } = useOptimisticMutation({
 *   mutationFn: async (variables, signal) => {
 *     const res = await fetch('/api/data', {
 *       method: 'PUT',
 *       body: JSON.stringify({
 *         ...variables,
 *         expectedVersion: currentVersion
 *       }),
 *       signal
 *     });
 *
 *     if (res.status === 409) {
 *       // Fetch latest version and retry
 *       const latest = await fetchLatestVersion();
 *       setCurrentVersion(latest.version);
 *       throw new Error('VERSION_CONFLICT');
 *     }
 *
 *     return res.json();
 *   },
 *   onOptimisticUpdate: (vars) => updateLocal(vars),
 *   onRollback: () => revertLocal(),
 *   retryConfig: {
 *     maxRetries: 5, // More retries for conflicts
 *     onRetry: (attempt) => {
 *       toast.info(`Syncing with server... (attempt ${attempt})`);
 *     }
 *   }
 * });
 */
export function useOptimisticMutation<TData, TVariables>(
  config: OptimisticMutationConfig<TData, TVariables>
): UseOptimisticMutationReturn<TData, TVariables> {
  const {
    mutationFn,
    onOptimisticUpdate,
    onRollback,
    onSuccess,
    onError,
    retryConfig = DEFAULT_RETRY_CONFIG,
    showToasts = true,
    successMessage,
    errorMessage = 'Failed to save. Please try again.',
  } = config;

  const [state, setState] = useState({
    isLoading: false,
    error: '',
    isRetrying: false,
    canRetry: false,
    retryAttempt: 0,
  });

  // Store the last mutation variables for retry capability
  const lastVariablesRef = useRef<TVariables | null>(null);

  // Ref for aborting in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Ref for tracking pending retry timeout
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    onRetry,
  } = retryConfig;

  /**
   * Helper function to wait for a specified delay.
   */
  const delay = (ms: number): Promise<void> =>
    new Promise(resolve => {
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        resolve();
      }, ms);
    });

  // Cleanup on unmount: abort in-flight requests and clear pending timeouts
  useEffect(() => {
    return () => {
      // Clear pending retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      // Abort in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const cancel = useCallback(() => {
    // Clear any pending retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Reset state
    setState(prev => ({
      ...prev,
      isRetrying: false,
      isLoading: false,
    }));
  }, []);

  const reset = useCallback(() => {
    cancel();
    lastVariablesRef.current = null;
    setState({
      isLoading: false,
      error: '',
      isRetrying: false,
      canRetry: false,
      retryAttempt: 0,
    });
  }, [cancel]);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData> => {
      // Store variables for retry
      lastVariablesRef.current = variables;

      // Abort any previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new AbortController for this request
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Apply optimistic update immediately
      onOptimisticUpdate(variables);

      // Initialize state
      setState({
        isLoading: true,
        error: '',
        isRetrying: false,
        canRetry: false,
        retryAttempt: 0,
      });

      let lastError: Error | unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Check if aborted before each attempt
          if (controller.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          // Update retry attempt counter
          setState(prev => ({
            ...prev,
            retryAttempt: attempt,
            isRetrying: attempt > 0,
          }));

          // Execute mutation
          const result = await mutationFn(variables, controller.signal);

          // Success! Clear state and call onSuccess
          setState({
            isLoading: false,
            error: '',
            isRetrying: false,
            canRetry: false,
            retryAttempt: 0,
          });

          onSuccess?.(result);

          if (showToasts && successMessage) {
            toast.success(successMessage);
          }

          return result;
        } catch (error) {
          lastError = error;

          // Don't retry on AbortError
          const isAbortError =
            error &&
            typeof error === 'object' &&
            'name' in error &&
            error.name === 'AbortError';

          if (isAbortError) {
            setState({
              isLoading: false,
              error: '',
              isRetrying: false,
              canRetry: false,
              retryAttempt: 0,
            });
            throw error;
          }

          // Call onError callback
          if (error instanceof Error) {
            onError?.(error);
          }

          // Check if we can retry
          const isLastAttempt = attempt >= maxRetries;

          if (isLastAttempt) {
            // Final attempt failed - rollback and set error state
            onRollback();

            const errorMsg =
              error instanceof Error ? error.message : errorMessage;

            setState({
              isLoading: false,
              error: errorMsg,
              isRetrying: false,
              canRetry: true,
              retryAttempt: attempt,
            });

            if (showToasts) {
              // Show the actual error message (errorMsg) for consistency with state
              toast.error(errorMsg);
            }

            throw error;
          }

          // Not the last attempt - prepare for retry
          if (onRetry && error instanceof Error) {
            onRetry(attempt + 1, error);
          }

          // Calculate backoff delay and wait
          const backoffDelay = calculateBackoffDelay(
            attempt,
            baseDelay,
            maxDelay
          );
          await delay(backoffDelay);
        }
      }

      // This should never be reached, but TypeScript needs it
      throw lastError;
    },
    [
      mutationFn,
      onOptimisticUpdate,
      onRollback,
      onSuccess,
      onError,
      maxRetries,
      baseDelay,
      maxDelay,
      onRetry,
      showToasts,
      successMessage,
      errorMessage,
    ]
  );

  const retry = useCallback(async (): Promise<TData> => {
    if (!lastVariablesRef.current) {
      throw new Error(
        'No failed mutation to retry. Ensure canRetry is true before calling retry().'
      );
    }

    const variablesToRetry = lastVariablesRef.current;

    // Clear stored variables and reset canRetry
    lastVariablesRef.current = null;
    setState(prev => ({
      ...prev,
      canRetry: false,
      retryAttempt: 0,
    }));

    // Re-execute the mutation with fresh retry cycle
    return mutate(variablesToRetry);
  }, [mutate]);

  return {
    mutate,
    isLoading: state.isLoading,
    error: state.error,
    isRetrying: state.isRetrying,
    canRetry: state.canRetry,
    retryAttempt: state.retryAttempt,
    retry,
    cancel,
    reset,
  };
}
