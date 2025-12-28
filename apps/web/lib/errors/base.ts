/**
 * Base error handling system for the Jovie application.
 * Provides structured error classes with consistent metadata and HTTP status codes.
 */

/**
 * Base error class for all application errors.
 * Extends the native Error class with additional context for better debugging and monitoring.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly metadata?: Record<string, unknown>,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Validation error for invalid input data.
 * Maps to HTTP 400 Bad Request.
 */
export class ValidationError extends AppError {
  constructor(message: string, field?: string, cause?: unknown) {
    super(
      message,
      'VALIDATION_ERROR',
      400,
      field ? { field } : undefined,
      cause
    );
  }
}

/**
 * Authentication error for missing or invalid credentials.
 * Maps to HTTP 401 Unauthorized.
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Unauthorized', cause?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', 401, undefined, cause);
  }
}

/**
 * Authorization error for insufficient permissions.
 * Maps to HTTP 403 Forbidden.
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Forbidden', cause?: unknown) {
    super(message, 'AUTHORIZATION_ERROR', 403, undefined, cause);
  }
}

/**
 * Not found error for missing resources.
 * Maps to HTTP 404 Not Found.
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string, cause?: unknown) {
    super(
      `${resource} not found${identifier ? `: ${identifier}` : ''}`,
      'NOT_FOUND',
      404,
      { resource, identifier },
      cause
    );
  }
}

/**
 * Conflict error for operations that violate constraints.
 * Maps to HTTP 409 Conflict.
 */
export class ConflictError extends AppError {
  constructor(
    message: string,
    metadata?: Record<string, unknown>,
    cause?: unknown
  ) {
    super(message, 'CONFLICT', 409, metadata, cause);
  }
}

/**
 * Rate limit error for exceeded request limits.
 * Maps to HTTP 429 Too Many Requests.
 */
export class RateLimitError extends AppError {
  constructor(
    message = 'Rate limit exceeded. Please try again later.',
    retryAfter?: number,
    cause?: unknown
  ) {
    super(
      message,
      'RATE_LIMIT_EXCEEDED',
      429,
      retryAfter ? { retryAfter } : undefined,
      cause
    );
  }
}

/**
 * External service error for failed external API calls.
 * Maps to HTTP 502 Bad Gateway.
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, cause?: unknown) {
    super(
      `${service} error: ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      { service },
      cause
    );
  }
}

/**
 * Type guard to check if an error is an AppError.
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
