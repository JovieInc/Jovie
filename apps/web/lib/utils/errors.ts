/**
 * Error message extraction utilities
 *
 * Provides consistent error message extraction across the codebase
 */

/**
 * Extracts a readable error message from any error value
 *
 * @param error - The error value (can be Error, string, object, or unknown)
 * @param fallback - Fallback message if extraction fails (default: 'An unknown error occurred')
 * @returns A string error message
 *
 * @example
 * ```ts
 * try {
 *   await riskyOperation()
 * } catch (error) {
 *   const message = extractErrorMessage(error)
 *   logger.error(message)
 * }
 * ```
 */
export function extractErrorMessage(
  error: unknown,
  fallback = 'An unknown error occurred'
): string {
  // Standard Error objects
  if (error instanceof Error) {
    return error.message;
  }

  // String errors
  if (typeof error === 'string') {
    return error;
  }

  // Objects with message property
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string') {
      return message;
    }
  }

  // Fallback
  return fallback;
}

/**
 * Converts any error to a string representation
 *
 * Unlike extractErrorMessage, this function attempts to stringify
 * the entire error object if it's not a standard Error.
 *
 * @param error - The error value
 * @returns A string representation of the error
 */
export function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Extracts error message and stack trace for logging
 *
 * @param error - The error value
 * @returns An object with message and optional stack trace
 */
export function extractErrorDetails(error: unknown): {
  message: string;
  stack?: string;
  name?: string;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }

  return {
    message: extractErrorMessage(error),
  };
}
