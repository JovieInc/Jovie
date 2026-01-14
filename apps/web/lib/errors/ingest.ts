/**
 * Ingest Error Handling
 *
 * Provides structured error types and handling for the Spotify ingest system.
 * Errors are designed to provide safe, user-facing messages while preserving
 * internal details for logging and debugging.
 *
 * Security:
 * - User-facing messages never expose internal system details
 * - Internal details are only logged server-side
 * - Error codes are stable identifiers for client handling
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * All possible ingest error codes.
 * These are stable identifiers that clients can use for error handling.
 */
export type IngestErrorCode =
  // Rate limiting
  | 'RATE_LIMITED'
  // Input validation
  | 'INVALID_INPUT'
  | 'INVALID_SPOTIFY_ID'
  | 'INVALID_HANDLE'
  | 'INVALID_QUERY'
  // Authorization
  | 'UNAUTHORIZED'
  | 'NOT_ARTIST_OWNER'
  | 'SPOTIFY_NOT_CONNECTED'
  // Claim errors
  | 'ARTIST_ALREADY_CLAIMED'
  | 'HANDLE_TAKEN'
  | 'CLAIM_IN_PROGRESS'
  // Spotify API errors
  | 'SPOTIFY_API_ERROR'
  | 'SPOTIFY_NOT_FOUND'
  | 'SPOTIFY_RATE_LIMITED'
  | 'SPOTIFY_UNAVAILABLE'
  // Database errors
  | 'DATABASE_ERROR'
  | 'TRANSACTION_FAILED'
  // General errors
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

// ============================================================================
// Error Class
// ============================================================================

/**
 * Structured error class for ingest operations.
 *
 * Contains:
 * - code: Stable identifier for the error type
 * - userMessage: Safe message to show to users
 * - internalDetails: Sensitive details for logging (never exposed to client)
 * - retryable: Whether the operation can be retried
 * - retryAfter: Optional delay before retry (in seconds)
 */
export class IngestError extends Error {
  public readonly code: IngestErrorCode;
  public readonly userMessage: string;
  public readonly internalDetails?: unknown;
  public readonly retryable: boolean;
  public readonly retryAfter?: number;

  constructor(
    code: IngestErrorCode,
    userMessage: string,
    options?: {
      internalDetails?: unknown;
      retryable?: boolean;
      retryAfter?: number;
    }
  ) {
    super(userMessage);
    this.name = 'IngestError';
    this.code = code;
    this.userMessage = userMessage;
    this.internalDetails = options?.internalDetails;
    this.retryable = options?.retryable ?? false;
    this.retryAfter = options?.retryAfter;
  }

  /**
   * Create a safe error object for client responses.
   * Never includes internal details.
   */
  toClientError(): {
    error: string;
    code: IngestErrorCode;
    retryable: boolean;
    retryAfter?: number;
  } {
    return {
      error: this.userMessage,
      code: this.code,
      retryable: this.retryable,
      ...(this.retryAfter ? { retryAfter: this.retryAfter } : {}),
    };
  }

  /**
   * Create an object for logging.
   * Includes all details including internal ones.
   */
  toLogObject(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.userMessage,
      internalDetails: this.internalDetails,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
      stack: this.stack,
    };
  }
}

// ============================================================================
// Error Messages Registry
// ============================================================================

/**
 * Centralized error messages for all ingest error codes.
 * Single source of truth for user-facing error messages.
 */
const ERROR_MESSAGES: Record<IngestErrorCode, string> = {
  RATE_LIMITED: 'Too many requests. Please wait and try again.',
  INVALID_INPUT: 'Invalid input. Please check your data and try again.',
  INVALID_SPOTIFY_ID: 'Invalid Spotify artist ID.',
  INVALID_HANDLE:
    'Invalid handle. Use only lowercase letters, numbers, and underscores.',
  INVALID_QUERY: 'Invalid search query.',
  UNAUTHORIZED: 'Please sign in to continue.',
  NOT_ARTIST_OWNER: 'You must be the owner of this Spotify artist account.',
  SPOTIFY_NOT_CONNECTED: 'Please connect your Spotify account first.',
  ARTIST_ALREADY_CLAIMED: 'This artist has already been claimed.',
  HANDLE_TAKEN: 'This handle is already in use.',
  CLAIM_IN_PROGRESS: 'A claim is already in progress. Please wait.',
  SPOTIFY_API_ERROR: 'Failed to communicate with Spotify.',
  SPOTIFY_NOT_FOUND: 'Artist not found on Spotify.',
  SPOTIFY_RATE_LIMITED: 'Spotify rate limit reached. Please wait.',
  SPOTIFY_UNAVAILABLE: 'Spotify is temporarily unavailable.',
  DATABASE_ERROR: 'A database error occurred.',
  TRANSACTION_FAILED: 'Operation failed. Please try again.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
};

// ============================================================================
// Error Factories
// ============================================================================

/**
 * Create a rate limited error.
 */
export function rateLimitedError(retryAfter?: number): IngestError {
  const message = retryAfter
    ? `Rate limited. Please try again in ${retryAfter} seconds.`
    : ERROR_MESSAGES.RATE_LIMITED;

  return new IngestError('RATE_LIMITED', message, {
    retryable: true,
    retryAfter,
  });
}

/**
 * Create an unauthorized error.
 */
export function unauthorizedError(details?: string): IngestError {
  return new IngestError('UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED, {
    internalDetails: details,
  });
}

/**
 * Create a validation error.
 * Accepts custom message or uses default from registry.
 */
export function validationError(
  message?: string,
  code:
    | 'INVALID_INPUT'
    | 'INVALID_SPOTIFY_ID'
    | 'INVALID_HANDLE'
    | 'INVALID_QUERY' = 'INVALID_INPUT'
): IngestError {
  return new IngestError(code, message ?? ERROR_MESSAGES[code]);
}

/**
 * Create a Spotify API error.
 */
export function spotifyApiError(
  internalDetails?: unknown,
  code:
    | 'SPOTIFY_API_ERROR'
    | 'SPOTIFY_NOT_FOUND'
    | 'SPOTIFY_RATE_LIMITED'
    | 'SPOTIFY_UNAVAILABLE' = 'SPOTIFY_API_ERROR'
): IngestError {
  return new IngestError(code, ERROR_MESSAGES[code], {
    internalDetails,
    retryable: code !== 'SPOTIFY_NOT_FOUND',
    retryAfter: code === 'SPOTIFY_RATE_LIMITED' ? 60 : undefined,
  });
}

/**
 * Create an artist claim error.
 */
export function claimError(
  code:
    | 'ARTIST_ALREADY_CLAIMED'
    | 'HANDLE_TAKEN'
    | 'NOT_ARTIST_OWNER'
    | 'SPOTIFY_NOT_CONNECTED'
    | 'CLAIM_IN_PROGRESS',
  details?: unknown
): IngestError {
  return new IngestError(code, ERROR_MESSAGES[code], {
    internalDetails: details,
  });
}

/**
 * Create a database error.
 */
export function databaseError(internalDetails?: unknown): IngestError {
  return new IngestError('DATABASE_ERROR', ERROR_MESSAGES.DATABASE_ERROR, {
    internalDetails,
    retryable: true,
  });
}

/**
 * Create an internal error (for unexpected failures).
 */
export function internalError(internalDetails?: unknown): IngestError {
  return new IngestError('INTERNAL_ERROR', ERROR_MESSAGES.INTERNAL_ERROR, {
    internalDetails,
    retryable: true,
  });
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Type guard for IngestError.
 */
export function isIngestError(error: unknown): error is IngestError {
  return error instanceof IngestError;
}

/**
 * Handle an ingest error and return a client-safe response.
 *
 * - If error is an IngestError, logs internal details and returns safe message
 * - If error is unknown, logs the full error and returns a generic message
 *
 * @param error - The error to handle
 * @param context - Additional context for logging (e.g., { userId, operation })
 * @returns A client-safe error response
 */
export function handleIngestError(
  error: unknown,
  context?: Record<string, unknown>
): {
  error: string;
  code: IngestErrorCode;
  retryable: boolean;
  retryAfter?: number;
} {
  if (isIngestError(error)) {
    // Log internal details server-side
    console.error('[Ingest Error]', {
      ...error.toLogObject(),
      ...context,
    });

    return error.toClientError();
  }

  // Unknown error - never leak details
  console.error('[Ingest Error] Unexpected error', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  });

  return {
    error: 'An unexpected error occurred. Please try again.',
    code: 'INTERNAL_ERROR',
    retryable: true,
  };
}

/**
 * Convert an unknown error to an IngestError.
 * Preserves IngestErrors, wraps others as internal errors.
 */
export function toIngestError(error: unknown): IngestError {
  if (isIngestError(error)) {
    return error;
  }

  return internalError(error);
}

/**
 * Get a user-friendly message for an error code.
 * Uses the centralized ERROR_MESSAGES registry.
 */
export function getUserFriendlyMessage(code: IngestErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.INTERNAL_ERROR;
}
