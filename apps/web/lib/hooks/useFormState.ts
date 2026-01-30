'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Options for configuring retry behavior in useFormState.
 *
 * @example
 * // Basic retry configuration
 * const formState = useFormState({
 *   maxRetries: 5,
 *   baseDelay: 500,
 *   maxDelay: 10000,
 * });
 *
 * @example
 * // With retry callback for logging/analytics
 * const formState = useFormState({
 *   maxRetries: 3,
 *   onRetry: (attempt, error) => {
 *     console.log(`Retry attempt ${attempt}: ${error.message}`);
 *   },
 * });
 */
export interface UseFormStateOptions {
  /**
   * Maximum number of automatic retry attempts after the initial failure.
   * Set to 0 to disable automatic retries.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds for exponential backoff calculation.
   * The actual delay is: min(baseDelay * 2^attempt, maxDelay) with ±10% jitter.
   * @default 1000
   */
  baseDelay?: number;

  /**
   * Maximum delay in milliseconds between retry attempts.
   * Caps the exponential backoff to prevent excessively long waits.
   * @default 30000
   */
  maxDelay?: number;

  /**
   * Callback invoked before each retry attempt.
   * Useful for logging, analytics, or showing retry notifications.
   *
   * @param attempt - The retry attempt number (1-based, so 1 is the first retry)
   * @param error - The error from the previous failed attempt
   *
   * @example
   * onRetry: (attempt, error) => {
   *   toast.info(`Retrying... Attempt ${attempt} of ${maxRetries}`);
   * }
   */
  onRetry?: (attempt: number, error: Error) => void;
}

/** Default values for retry options */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY = 1000;
const DEFAULT_MAX_DELAY = 30000;

/**
 * Calculate delay for exponential backoff with jitter.
 * Uses formula: min(baseDelay * 2^attempt, maxDelay) with ±10% jitter.
 *
 * @param attempt - The current retry attempt (0-based)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay cap in milliseconds
 * @returns Delay in milliseconds with jitter applied
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  // Calculate exponential delay: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter: ±10% to prevent thundering herd
  // Random value between 0.9 and 1.1
  const jitterMultiplier = 0.9 + Math.random() * 0.2;

  return Math.round(cappedDelay * jitterMultiplier);
}

/**
 * Internal state managed by the useFormState hook.
 * Tracks loading, error, success states along with retry information.
 */
interface FormState {
  /**
   * Whether an async operation is currently in progress.
   * Set to true when handleAsync starts, false when it completes or fails.
   */
  loading: boolean;

  /**
   * Error message from the last failed operation.
   * Empty string when no error. Set when all retry attempts are exhausted.
   */
  error: string;

  /**
   * Success message from the last successful operation.
   * Empty string when no success message has been set.
   */
  success: string;

  /**
   * Total number of retries configured (from maxRetries option).
   * This represents how many automatic retries will be attempted after an initial failure.
   */
  retryCount: number;

  /**
   * Current retry attempt number (0-based).
   * - 0: Initial attempt (not a retry)
   * - 1: First retry
   * - 2: Second retry
   * - etc.
   */
  retryAttempt: number;

  /**
   * Whether an automatic retry is currently in progress.
   * True only during retry attempts (retryAttempt > 0), false during initial attempt.
   * Useful for showing "Retrying..." UI feedback.
   */
  isRetrying: boolean;

  /**
   * Whether the retry() method can be called to manually retry the last failed operation.
   * True when all automatic retries have been exhausted and a failed operation is stored.
   * False when no operation has failed, or when a retry is in progress.
   */
  canRetry: boolean;
}

/**
 * Return type of the useFormState hook.
 * Extends FormState with methods for managing state and executing async operations.
 */
interface UseFormStateReturn extends FormState {
  /**
   * Manually set the loading state.
   * @param loading - Whether loading is in progress
   */
  setLoading: (loading: boolean) => void;

  /**
   * Set an error message. Also clears loading and success states.
   * @param error - Error message to display
   */
  setError: (error: string) => void;

  /**
   * Set a success message. Also clears loading and error states.
   * @param success - Success message to display
   */
  setSuccess: (success: string) => void;

  /**
   * Reset all state to initial values.
   * Clears loading, error, success, and all retry-related state.
   * Also clears any stored failed operation (canRetry becomes false).
   */
  reset: () => void;

  /**
   * Execute an async function with automatic loading/error state management and retry support.
   *
   * Features:
   * - Sets loading state automatically
   * - Handles errors and sets error state
   * - Automatically retries failed operations based on retry options
   * - Aborts any previous in-flight request before starting a new one
   * - Passes AbortSignal for cancellation support
   *
   * @typeParam T - The return type of the async function
   * @param asyncFn - Async function to execute. Receives an AbortSignal for cancellation support.
   * @returns Promise that resolves to the result of the async function
   * @throws Rethrows any error after all retries are exhausted (or on AbortError)
   *
   * @example
   * // Basic usage - simple async operation
   * await handleAsync(async () => {
   *   const response = await fetch('/api/users');
   *   return response.json();
   * });
   *
   * @example
   * // With cancellation support - pass signal to fetch
   * await handleAsync(async (signal) => {
   *   const response = await fetch('/api/data', { signal });
   *   if (!response.ok) throw new Error('Failed to fetch');
   *   return response.json();
   * });
   *
   * @example
   * // Error handling
   * try {
   *   const result = await handleAsync(async (signal) => {
   *     return await riskyOperation(signal);
   *   });
   *   console.log('Success:', result);
   * } catch (error) {
   *   // Error state is already set, but you can handle it here too
   *   console.error('All retries failed:', error);
   * }
   */
  handleAsync: <T>(asyncFn: (signal: AbortSignal) => Promise<T>) => Promise<T>;

  /**
   * Manually retry the last failed async operation.
   *
   * Use this to provide a "Try Again" button after all automatic retries are exhausted.
   * Starts a fresh retry cycle with retryAttempt reset to 0.
   *
   * @typeParam T - The expected return type (defaults to unknown)
   * @returns Promise that resolves to the result of the retried operation
   * @throws Error if no failed operation is stored (canRetry is false)
   * @throws Rethrows any error from the retried operation if it fails again
   *
   * @example
   * // Retry button in a React component
   * function SubmitForm() {
   *   const { handleAsync, error, canRetry, retry, isRetrying } = useFormState();
   *
   *   const handleSubmit = async () => {
   *     await handleAsync(async (signal) => {
   *       return await submitForm(formData, signal);
   *     });
   *   };
   *
   *   return (
   *     <>
   *       <button onClick={handleSubmit}>Submit</button>
   *       {error && canRetry && (
   *         <button onClick={retry} disabled={isRetrying}>
   *           {isRetrying ? 'Retrying...' : 'Try Again'}
   *         </button>
   *       )}
   *       {error && <p className="error">{error}</p>}
   *     </>
   *   );
   * }
   */
  retry: <T = unknown>() => Promise<T>;

  /**
   * Cancel the current in-flight request and any pending retry.
   *
   * Use this when the user navigates away, closes a modal, or explicitly cancels an operation.
   * Aborts the request via AbortController and clears any scheduled retry delays.
   *
   * @example
   * // Cancel button in a React component
   * function LoadingDialog({ onClose }) {
   *   const { handleAsync, loading, cancel } = useFormState();
   *
   *   const handleCancel = () => {
   *     cancel();
   *     onClose();
   *   };
   *
   *   return (
   *     <dialog>
   *       {loading && <p>Loading...</p>}
   *       <button onClick={handleCancel}>Cancel</button>
   *     </dialog>
   *   );
   * }
   *
   * @example
   * // Cancel on component unmount (automatic via useEffect cleanup)
   * // Note: The hook automatically handles cleanup on unmount,
   * // but you can also call cancel() manually when needed.
   */
  cancel: () => void;
}

/**
 * A React hook for managing async operation state with automatic retry support.
 *
 * Provides loading, error, and success state management for async operations,
 * with features including:
 * - Automatic retry with configurable exponential backoff
 * - Manual retry capability via retry() method
 * - Request cancellation via cancel() method and AbortController
 * - Automatic cleanup on component unmount
 *
 * @param options - Optional configuration for retry behavior
 * @returns An object containing state values and methods for managing async operations
 *
 * @example
 * // Basic usage with default retry settings (3 retries, 1s base delay)
 * function MyComponent() {
 *   const { loading, error, handleAsync } = useFormState();
 *
 *   const fetchData = async () => {
 *     const result = await handleAsync(async (signal) => {
 *       const response = await fetch('/api/data', { signal });
 *       return response.json();
 *     });
 *     console.log('Data:', result);
 *   };
 *
 *   return (
 *     <div>
 *       {loading && <p>Loading...</p>}
 *       {error && <p className="error">{error}</p>}
 *       <button onClick={fetchData} disabled={loading}>
 *         Fetch Data
 *       </button>
 *     </div>
 *   );
 * }
 *
 * @example
 * // Form submission with retry and manual retry button
 * function SubmitForm() {
 *   const {
 *     loading,
 *     error,
 *     success,
 *     isRetrying,
 *     canRetry,
 *     handleAsync,
 *     retry,
 *     setSuccess,
 *   } = useFormState({
 *     maxRetries: 2,
 *     baseDelay: 500,
 *     onRetry: (attempt, err) => {
 *       console.log(`Retry attempt ${attempt}: ${err.message}`);
 *     },
 *   });
 *
 *   const handleSubmit = async (formData: FormData) => {
 *     const result = await handleAsync(async (signal) => {
 *       const response = await fetch('/api/submit', {
 *         method: 'POST',
 *         body: formData,
 *         signal,
 *       });
 *       if (!response.ok) throw new Error('Submission failed');
 *       return response.json();
 *     });
 *     setSuccess('Form submitted successfully!');
 *     return result;
 *   };
 *
 *   return (
 *     <form onSubmit={e => { e.preventDefault(); handleSubmit(new FormData(e.target)); }}>
 *       <input name="email" type="email" required />
 *       <button type="submit" disabled={loading}>
 *         {isRetrying ? 'Retrying...' : loading ? 'Submitting...' : 'Submit'}
 *       </button>
 *       {error && (
 *         <div>
 *           <p className="error">{error}</p>
 *           {canRetry && <button onClick={retry}>Try Again</button>}
 *         </div>
 *       )}
 *       {success && <p className="success">{success}</p>}
 *     </form>
 *   );
 * }
 *
 * @example
 * // Using cancel() for cleanup when closing a modal
 * function AsyncModal({ onClose }) {
 *   const { loading, handleAsync, cancel } = useFormState();
 *
 *   const handleClose = () => {
 *     cancel(); // Abort any in-flight request
 *     onClose();
 *   };
 *
 *   useEffect(() => {
 *     // Start async operation when modal opens
 *     handleAsync(async (signal) => {
 *       return await loadData(signal);
 *     });
 *   }, [handleAsync]);
 *
 *   return (
 *     <dialog open>
 *       {loading && <p>Loading...</p>}
 *       <button onClick={handleClose}>Close</button>
 *     </dialog>
 *   );
 * }
 *
 * @example
 * // Disable automatic retries
 * const formState = useFormState({ maxRetries: 0 });
 *
 * @example
 * // Custom retry configuration for slow APIs
 * const formState = useFormState({
 *   maxRetries: 5,
 *   baseDelay: 2000,  // Start with 2 second delay
 *   maxDelay: 60000,  // Cap at 1 minute
 *   onRetry: (attempt, error) => {
 *     analytics.track('api_retry', { attempt, error: error.message });
 *   },
 * });
 */
export function useFormState(
  options: UseFormStateOptions = {}
): UseFormStateReturn {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelay = DEFAULT_BASE_DELAY,
    maxDelay = DEFAULT_MAX_DELAY,
    onRetry,
  } = options;

  const [state, setState] = useState<FormState>({
    loading: false,
    error: '',
    success: '',
    retryCount: 0,
    retryAttempt: 0,
    isRetrying: false,
    canRetry: false,
  });

  // Store the last async function for retry capability
  const lastAsyncFnRef = useRef<
    ((signal: AbortSignal) => Promise<unknown>) | null
  >(null);

  // Ref for aborting in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Ref for tracking pending retry timeout
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount - abort any in-flight request and clear retry timeout
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, loading }));
  }, []);

  const setError = useCallback((error: string) => {
    setState(prev => ({ ...prev, error, loading: false, success: '' }));
  }, []);

  const setSuccess = useCallback((success: string) => {
    setState(prev => ({ ...prev, success, loading: false, error: '' }));
  }, []);

  const reset = useCallback(() => {
    // Clear stored async function on reset
    lastAsyncFnRef.current = null;
    setState({
      loading: false,
      error: '',
      success: '',
      retryCount: 0,
      retryAttempt: 0,
      isRetrying: false,
      canRetry: false,
    });
  }, []);

  /**
   * Helper function to wait for a specified delay.
   * Stores the timeout ID in retryTimeoutRef for cancellation support.
   */
  const delay = (ms: number): Promise<void> =>
    new Promise(resolve => {
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        resolve();
      }, ms);
    });

  /**
   * Checks if an error is an AbortError (user cancellation).
   */
  const isAbortError = (error: unknown): boolean => {
    return (
      error !== null &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'AbortError'
    );
  };

  /**
   * Handles retry logic for a failed attempt.
   * Returns true if retry should be attempted, false otherwise.
   */
  const shouldRetryAfterError = useCallback(
    async (
      error: unknown,
      attempt: number,
      asyncFn: (signal: AbortSignal) => Promise<unknown>
    ): Promise<boolean> => {
      // Don't retry on AbortError
      if (isAbortError(error)) {
        setState(prev => ({
          ...prev,
          loading: false,
          isRetrying: false,
          canRetry: false,
        }));
        return false;
      }

      const isLastAttempt = attempt >= maxRetries;

      if (isLastAttempt) {
        // Final attempt failed - store function for manual retry
        lastAsyncFnRef.current = asyncFn;
        const errorMessage =
          error instanceof Error ? error.message : 'An error occurred';
        setState(prev => ({
          ...prev,
          canRetry: true,
          isRetrying: false,
          loading: false,
          error: errorMessage,
        }));
        return false;
      }

      // Not the last attempt - prepare for retry
      if (onRetry && error instanceof Error) {
        onRetry(attempt + 1, error);
      }

      // Calculate backoff delay and wait
      const backoffDelay = calculateBackoffDelay(attempt, baseDelay, maxDelay);
      await delay(backoffDelay);
      return true;
    },
    [maxRetries, baseDelay, maxDelay, onRetry]
  );

  const handleAsync = useCallback(
    <T>(asyncFn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      const promise = (async (): Promise<T> => {
        // Abort any previous in-flight request before starting new one
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        // Create new AbortController for this request
        const controller = new AbortController();
        abortControllerRef.current = controller;

        // Initialize state for new async operation
        setState(prev => ({
          ...prev,
          loading: true,
          error: '',
          success: '',
          retryCount: maxRetries,
          retryAttempt: 0,
          isRetrying: false,
        }));

        let lastError: unknown;

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

            // Pass signal to async function for cancellation support
            const result = await asyncFn(controller.signal);

            // Clear stored function on success - no retry needed
            lastAsyncFnRef.current = null;
            setState(prev => ({
              ...prev,
              loading: false,
              canRetry: false,
              isRetrying: false,
            }));
            return result;
          } catch (error) {
            lastError = error;

            // Handle retry logic
            const shouldRetry = await shouldRetryAfterError(
              error,
              attempt,
              asyncFn as (signal: AbortSignal) => Promise<unknown>
            );

            if (!shouldRetry) {
              throw error;
            }
          }
        }

        // This should never be reached, but TypeScript needs it
        throw lastError;
      })();

      // Attach a handler immediately to avoid unhandled rejections for callers
      // that create the promise but don't attach handlers until later.
      void promise.catch(() => {});

      return promise;
    },
    [maxRetries, baseDelay, maxDelay, onRetry, shouldRetryAfterError]
  );

  /**
   * Manually retry the last failed async operation.
   * Throws an error if no failed operation is stored (canRetry is false).
   * Resets retryAttempt to 0 and starts a fresh retry cycle.
   */
  const retry = useCallback(async <T = unknown>(): Promise<T> => {
    if (!lastAsyncFnRef.current) {
      throw new Error(
        'No failed operation to retry. Ensure canRetry is true before calling retry().'
      );
    }

    // Get the stored function before calling handleAsync (which will update the ref)
    const asyncFnToRetry = lastAsyncFnRef.current as (
      signal: AbortSignal
    ) => Promise<T>;

    // Clear the stored function and reset canRetry before starting fresh retry cycle
    lastAsyncFnRef.current = null;
    setState(prev => ({
      ...prev,
      canRetry: false,
      retryAttempt: 0,
    }));

    // Re-execute the operation with fresh retry cycle
    return handleAsync(asyncFnToRetry);
  }, [handleAsync]);

  /**
   * Cancel the current in-flight request and any pending retry.
   * Aborts the current request via AbortController, clears any pending retry timeouts,
   * and resets isRetrying to false.
   */
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

    // Reset isRetrying state
    setState(prev => ({
      ...prev,
      isRetrying: false,
      loading: false,
    }));
  }, []);

  return {
    ...state,
    setLoading,
    setError,
    setSuccess,
    reset,
    handleAsync,
    retry,
    cancel,
  };
}
