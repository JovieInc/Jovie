/**
 * Standardized Error Handling for TanStack Pacer
 *
 * Provides consistent error detection and formatting utilities
 * for all pacer hooks across the application.
 *
 * @see https://tanstack.com/pacer
 */

/**
 * Check if an error is an AbortError (from AbortController).
 * Handles both standard AbortError and DOMException variants.
 */
export function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'AbortError' || err.message === 'AbortError';
}

/**
 * Check if an error was caused by a timeout.
 * Requires the original AbortSignal to distinguish from manual cancellation.
 *
 * @param err - The error to check
 * @param signal - The AbortSignal that was used (optional)
 * @param wasTimedOut - External flag indicating timeout occurred
 */
export function isTimeoutError(
  err: unknown,
  options?: { signal?: AbortSignal; wasTimedOut?: boolean }
): boolean {
  if (!isAbortError(err)) return false;

  // If we have an explicit timeout flag, use it
  if (options?.wasTimedOut !== undefined) {
    return options.wasTimedOut;
  }

  // If signal is provided and aborted, it could be either timeout or manual cancel
  // Without additional context, we can't distinguish, so return false for safety
  return false;
}

/**
 * Check if an error is a network-related error.
 */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const message = err.message.toLowerCase();
  return (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('offline') ||
    message.includes('failed to fetch') // fetch TypeError message
  );
}

/**
 * Check if an error is an HTTP error (non-2xx response).
 */
export function isHttpError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes('HTTP');
}

/**
 * Extract HTTP status code from an error message if present.
 */
export function getHttpStatusCode(err: unknown): number | undefined {
  if (!(err instanceof Error)) return undefined;

  const match = /HTTP\s*(\d{3})/i.exec(err.message);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

export type PacerErrorType =
  | 'abort'
  | 'timeout'
  | 'network'
  | 'http'
  | 'unknown';

/**
 * Classify an error into a PacerErrorType.
 */
export function classifyError(
  err: unknown,
  options?: { wasTimedOut?: boolean }
): PacerErrorType {
  if (isAbortError(err)) {
    return options?.wasTimedOut ? 'timeout' : 'abort';
  }
  if (isNetworkError(err)) return 'network';
  if (isHttpError(err)) return 'http';
  return 'unknown';
}

/**
 * User-friendly error messages for each error type.
 */
export const ERROR_MESSAGES: Record<PacerErrorType, string> = {
  abort: 'Request cancelled',
  timeout: 'Request timed out - please try again',
  network: 'Connection failed - check your internet',
  http: 'Server error - please try again',
  unknown: 'Something went wrong - please try again',
};

/**
 * Format an error into a user-friendly message.
 *
 * @example
 * ```tsx
 * try {
 *   await validateHandle(value);
 * } catch (err) {
 *   const message = formatPacerError(err);
 *   setError(message);
 * }
 * ```
 */
export function formatPacerError(
  err: unknown,
  options?: {
    wasTimedOut?: boolean;
    customMessages?: Partial<Record<PacerErrorType, string>>;
  }
): string {
  const errorType = classifyError(err, options);
  const messages = { ...ERROR_MESSAGES, ...options?.customMessages };
  return messages[errorType];
}

/**
 * Normalize unknown errors into Error instances with a formatted message.
 */
export function toPacerError(
  err: unknown,
  options?: {
    wasTimedOut?: boolean;
    customMessages?: Partial<Record<PacerErrorType, string>>;
  }
): Error {
  const message = formatPacerError(err, options);

  if (err instanceof Error) {
    if (err.message === message) {
      return err;
    }
    const formattedError = new Error(message, { cause: err });
    formattedError.name = err.name;
    return formattedError;
  }

  return new Error(message, { cause: err });
}

/**
 * Create an error handler that automatically formats errors.
 *
 * @example
 * ```tsx
 * const handleError = createPacerErrorHandler({
 *   onError: (message, type) => {
 *     notifications.error(message);
 *     analytics.track('validation_error', { type });
 *   },
 *   customMessages: {
 *     timeout: 'Taking too long - please try again',
 *   },
 * });
 *
 * // In your hook
 * try {
 *   await validate(value);
 * } catch (err) {
 *   handleError(err, { wasTimedOut: didTimeout });
 * }
 * ```
 */
export function createPacerErrorHandler(config: {
  onError: (
    message: string,
    type: PacerErrorType,
    originalError: unknown
  ) => void;
  customMessages?: Partial<Record<PacerErrorType, string>>;
  /** If true, abort errors are ignored (not reported) */
  ignoreAbort?: boolean;
}): (err: unknown, options?: { wasTimedOut?: boolean }) => void {
  const { onError, customMessages, ignoreAbort = true } = config;

  return (err: unknown, options?: { wasTimedOut?: boolean }) => {
    const errorType = classifyError(err, options);

    // Optionally ignore abort errors (user cancelled)
    if (ignoreAbort && errorType === 'abort') {
      return;
    }

    const message = formatPacerError(err, { ...options, customMessages });
    onError(message, errorType, err);
  };
}

/**
 * Wrap an async function with standardized error handling.
 *
 * @example
 * ```tsx
 * const safeValidate = withPacerErrorHandling(
 *   async (handle: string, signal: AbortSignal) => {
 *     const response = await fetch(`/api/check?handle=${handle}`, { signal });
 *     if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *     return response.json();
 *   },
 *   {
 *     onError: (message) => setError(message),
 *   }
 * );
 * ```
 */
export function withPacerErrorHandling<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: {
    onError: (message: string, type: PacerErrorType) => void;
    customMessages?: Partial<Record<PacerErrorType, string>>;
    ignoreAbort?: boolean;
  }
): (...args: TArgs) => Promise<TResult | undefined> {
  const errorHandler = createPacerErrorHandler({
    onError: (message, type) => config.onError(message, type),
    customMessages: config.customMessages,
    ignoreAbort: config.ignoreAbort,
  });

  return async (...args: TArgs): Promise<TResult | undefined> => {
    try {
      return await fn(...args);
    } catch (err) {
      errorHandler(err);
      return undefined;
    }
  };
}
