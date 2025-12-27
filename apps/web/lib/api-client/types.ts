/**
 * API Client Types
 *
 * Centralized TypeScript types for API responses, error handling,
 * request options, and client configuration.
 */

// =============================================================================
// HTTP Types
// =============================================================================

/**
 * Supported HTTP methods for API requests
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Standard HTTP status codes used in API responses
 */
export type HttpStatusCode =
  | 200 // OK
  | 201 // Created
  | 204 // No Content
  | 400 // Bad Request
  | 401 // Unauthorized
  | 403 // Forbidden
  | 404 // Not Found
  | 409 // Conflict
  | 422 // Unprocessable Entity
  | 429 // Too Many Requests
  | 500 // Internal Server Error
  | 502 // Bad Gateway
  | 503 // Service Unavailable
  | 504; // Gateway Timeout

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error codes for API client errors
 */
export enum ApiErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  ABORTED = 'ABORTED',

  // HTTP errors
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVER_ERROR = 'SERVER_ERROR',

  // Parse errors
  JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',

  // Generic
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Shape of the error response returned by API endpoints
 */
export interface ApiErrorResponse {
  error?: string;
  message?: string;
  details?: string;
  code?: string;
}

/**
 * Options for creating an ApiError
 */
export interface ApiErrorOptions {
  /** The error code categorizing the type of error */
  code: ApiErrorCode;
  /** HTTP status code from the response (if available) */
  status?: number;
  /** The original error response body */
  response?: ApiErrorResponse;
  /** The original Error that caused this API error */
  cause?: Error;
  /** Whether the error is potentially retryable */
  retryable?: boolean;
}

/**
 * Unified API error class for consistent error handling across the app.
 *
 * @example
 * ```ts
 * try {
 *   await apiClient.dashboard.profile.update({ ... });
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     if (error.isUnauthorized()) {
 *       // Handle auth error
 *     }
 *     showToast({ type: 'error', message: error.message });
 *   }
 * }
 * ```
 */
export class ApiError extends Error {
  /** The error code categorizing the type of error */
  readonly code: ApiErrorCode;
  /** HTTP status code from the response (if available) */
  readonly status?: number;
  /** The original error response body */
  readonly response?: ApiErrorResponse;
  /** Whether the error is potentially retryable */
  readonly retryable: boolean;

  constructor(message: string, options: ApiErrorOptions) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    this.response = options.response;
    this.retryable = options.retryable ?? false;

    // Maintain proper stack trace for V8
    if (options.cause && Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }

    // Set the prototype explicitly for instanceof to work in transpiled code
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Check if this is an authentication error (401)
   */
  isUnauthorized(): boolean {
    return this.code === ApiErrorCode.UNAUTHORIZED || this.status === 401;
  }

  /**
   * Check if this is a permission error (403)
   */
  isForbidden(): boolean {
    return this.code === ApiErrorCode.FORBIDDEN || this.status === 403;
  }

  /**
   * Check if this is a not found error (404)
   */
  isNotFound(): boolean {
    return this.code === ApiErrorCode.NOT_FOUND || this.status === 404;
  }

  /**
   * Check if this is a rate limit error (429)
   */
  isRateLimited(): boolean {
    return this.code === ApiErrorCode.RATE_LIMITED || this.status === 429;
  }

  /**
   * Check if this is a server error (5xx)
   */
  isServerError(): boolean {
    return (
      this.code === ApiErrorCode.SERVER_ERROR ||
      (this.status !== undefined && this.status >= 500)
    );
  }

  /**
   * Check if this is a network-related error
   */
  isNetworkError(): boolean {
    return (
      this.code === ApiErrorCode.NETWORK_ERROR ||
      this.code === ApiErrorCode.TIMEOUT ||
      this.code === ApiErrorCode.ABORTED
    );
  }

  /**
   * Create an ApiError from an HTTP response
   */
  static fromResponse(status: number, response?: ApiErrorResponse): ApiError {
    const code = mapStatusToErrorCode(status);
    const message =
      response?.error ||
      response?.message ||
      getDefaultMessageForStatus(status);
    const retryable = status >= 500 || status === 429;

    return new ApiError(message, {
      code,
      status,
      response,
      retryable,
    });
  }

  /**
   * Create an ApiError from a network error
   */
  static fromNetworkError(error: Error): ApiError {
    const isTimeout =
      error.name === 'AbortError' ||
      error.message.includes('timeout') ||
      error.message.includes('timed out');

    const isAborted =
      error.name === 'AbortError' && !error.message.includes('timeout');

    let code = ApiErrorCode.NETWORK_ERROR;
    if (isTimeout) code = ApiErrorCode.TIMEOUT;
    if (isAborted) code = ApiErrorCode.ABORTED;

    return new ApiError(
      isTimeout
        ? 'Request timed out'
        : isAborted
          ? 'Request was cancelled'
          : 'Network error occurred',
      {
        code,
        cause: error,
        retryable: !isAborted,
      }
    );
  }

  /**
   * Create an ApiError from a JSON parse error
   */
  static fromJsonParseError(error: Error): ApiError {
    return new ApiError('Failed to parse response', {
      code: ApiErrorCode.JSON_PARSE_ERROR,
      cause: error,
      retryable: false,
    });
  }

  /**
   * Create a serializable representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      status: this.status,
      response: this.response,
      retryable: this.retryable,
    };
  }
}

/**
 * Map HTTP status code to ApiErrorCode
 */
function mapStatusToErrorCode(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return ApiErrorCode.BAD_REQUEST;
    case 401:
      return ApiErrorCode.UNAUTHORIZED;
    case 403:
      return ApiErrorCode.FORBIDDEN;
    case 404:
      return ApiErrorCode.NOT_FOUND;
    case 409:
      return ApiErrorCode.CONFLICT;
    case 422:
      return ApiErrorCode.UNPROCESSABLE_ENTITY;
    case 429:
      return ApiErrorCode.RATE_LIMITED;
    default:
      if (status >= 500) {
        return ApiErrorCode.SERVER_ERROR;
      }
      return ApiErrorCode.UNKNOWN_ERROR;
  }
}

/**
 * Get default error message for HTTP status code
 */
function getDefaultMessageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid request';
    case 401:
      return 'Authentication required';
    case 403:
      return 'Access denied';
    case 404:
      return 'Resource not found';
    case 409:
      return 'Resource conflict';
    case 422:
      return 'Validation failed';
    case 429:
      return 'Too many requests. Please try again later';
    case 500:
      return 'Server error occurred';
    case 502:
      return 'Service temporarily unavailable';
    case 503:
      return 'Service unavailable';
    case 504:
      return 'Request timed out';
    default:
      return 'An unexpected error occurred';
  }
}

// =============================================================================
// Request Types
// =============================================================================

/**
 * Options for API requests
 */
export interface RequestOptions {
  /** Request headers to include */
  headers?: HeadersInit;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
  /** Whether to include credentials (cookies) */
  credentials?: RequestCredentials;
  /** Next.js fetch cache option */
  cache?: RequestCache;
  /** Next.js fetch revalidation option */
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
}

/**
 * Options for requests with a body (POST, PUT, PATCH)
 */
export interface RequestWithBodyOptions extends RequestOptions {
  /** The request body - will be JSON serialized */
  body?: unknown;
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Wrapper type for successful API responses
 */
export interface ApiResponse<T> {
  /** The response data */
  data: T;
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Headers;
}

/**
 * Result type that represents either success or failure
 * Useful for operations where you want to handle errors in-band
 */
export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: ApiError };

// =============================================================================
// Client Configuration
// =============================================================================

/**
 * Configuration for the API client
 */
export interface ApiClientConfig {
  /** Base URL for API requests. Defaults to '' for same-origin requests */
  baseUrl?: string;
  /** Default headers to include in all requests */
  defaultHeaders?: HeadersInit;
  /** Default timeout in milliseconds */
  timeout?: number;
  /** Default credentials option */
  credentials?: RequestCredentials;
  /** Whether to throw on non-2xx responses. Defaults to true */
  throwOnError?: boolean;
  /** Callback for handling errors before they're thrown */
  onError?: (error: ApiError) => void;
  /** Callback for handling responses before they're returned */
  onResponse?: <T>(response: ApiResponse<T>) => ApiResponse<T>;
}

/**
 * Default configuration values
 */
export const DEFAULT_API_CLIENT_CONFIG: Required<
  Omit<ApiClientConfig, 'onError' | 'onResponse'>
> = {
  baseUrl: '',
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds
  credentials: 'same-origin',
  throwOnError: true,
};

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if an error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Type guard to check if a value is an API error response shape
 */
export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.error === 'string' || typeof obj.message === 'string';
}
