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
 * JSON.stringify drops Error.message because it is non-enumerable.
 * Keep name + message so wrapped UpstashError payloads stay diagnosable.
 */
export function errorJsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Error)
  );
}

/**
 * `captureWarning(msg, { source, creatorProfileId, ... })` used to become
 * Linear title `Error: {"source":"..."}` (JOV-5263). A plain object with
 * neither `error` nor `message` is context, not an exception.
 */
function isContextOnlyCaptureBag(
  value: unknown
): value is Record<string, unknown> {
  return isPlainObject(value) && !('error' in value) && !('message' in value);
}

/**
 * Callers often pass `{ error }` as captureError's second argument.
 * Unwrap that so Sentry captures the inner Error instead of
 * `Error: {"error":{"name":"UpstashError"}}`.
 */
export function unwrapCapturedError(error: unknown): unknown {
  if (isContextOnlyCaptureBag(error)) {
    return undefined;
  }
  if (!isPlainObject(error) || !('error' in error)) {
    return error;
  }
  return error.error;
}

/**
 * Promote leftover fields from a `{ error, ...context }` wrapper into
 * capture context (e.g. clerkUserId on ban-check Redis failures).
 */
export function unwrapCapturedContext(
  error: unknown,
  context?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (isContextOnlyCaptureBag(error)) {
    const merged = { ...error, ...(context ?? {}) };
    return Object.keys(merged).length > 0 ? merged : undefined;
  }
  if (!isPlainObject(error) || !('error' in error)) {
    return context;
  }
  const { error: _nested, ...rest } = error;
  const merged = { ...rest, ...(context ?? {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

const REDIS_QUOTA_PATTERN =
  /max requests limit|quota exceeded|request limit exceeded/i;

function collectErrorText(error: unknown): string {
  const unwrapped = unwrapCapturedError(error);
  const parts: string[] = [];
  if (unwrapped instanceof Error) {
    parts.push(unwrapped.message, unwrapped.name);
    if (unwrapped.cause instanceof Error) {
      parts.push(unwrapped.cause.message, unwrapped.cause.name);
    }
  } else if (typeof unwrapped === 'string') {
    parts.push(unwrapped);
  } else {
    parts.push(errorToString(unwrapped));
  }
  if (error instanceof Error) {
    parts.push(error.message, error.name);
  }
  return parts.join(' ');
}

export function isRedisQuotaFailure(error: unknown): boolean {
  return REDIS_QUOTA_PATTERN.test(collectErrorText(error));
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
    return JSON.stringify(error, errorJsonReplacer);
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
