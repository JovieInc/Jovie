/**
 * Retry Utilities for Spotify API
 *
 * Provides retry logic with exponential backoff for transient failures.
 *
 * Security considerations:
 * - Server-only module
 * - Configurable max retries to prevent infinite loops
 * - Respects Retry-After headers from Spotify
 * - Jitter to prevent thundering herd
 */

import 'server-only';
import * as Sentry from '@sentry/nextjs';

// ============================================================================
// Types
// ============================================================================

export interface RetryConfig {
  /** Maximum number of retry attempts. Default: 3 */
  maxRetries: number;
  /** Base delay in ms between retries. Default: 1000 */
  baseDelay: number;
  /** Maximum delay in ms between retries. Default: 30000 */
  maxDelay: number;
  /** Multiplier for exponential backoff. Default: 2 */
  backoffMultiplier: number;
  /** Add random jitter (0-1 as percentage of delay). Default: 0.1 */
  jitter: number;
  /** HTTP status codes that should trigger retry. Default: [429, 500, 502, 503, 504] */
  retryableStatuses: number[];
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30_000,
  backoffMultiplier: 2,
  jitter: 0.1,
  retryableStatuses: [429, 500, 502, 503, 504],
};

// ============================================================================
// Retry Implementation
// ============================================================================

/**
 * Calculate delay for next retry attempt with exponential backoff and jitter.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param config - Retry configuration
 * @param retryAfter - Optional Retry-After value from server (in seconds)
 * @returns Delay in milliseconds
 */
export function calculateDelay(
  attempt: number,
  config: RetryConfig,
  retryAfter?: number
): number {
  // If server provided Retry-After, respect it
  if (retryAfter !== undefined && retryAfter > 0) {
    const serverDelay = retryAfter * 1000;
    // Cap at maxDelay and ensure non-negative
    return Math.max(0, Math.min(serverDelay, config.maxDelay));
  }

  // Calculate exponential backoff
  const exponentialDelay =
    config.baseDelay * Math.pow(config.backoffMultiplier, attempt);

  // Apply jitter
  const jitterRange = exponentialDelay * config.jitter;
  const jitter = Math.random() * jitterRange * 2 - jitterRange;

  // Cap at maxDelay and ensure non-negative
  return Math.max(0, Math.min(exponentialDelay + jitter, config.maxDelay));
}

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable based on configuration.
 */
function isErrorRetryable(error: unknown, config: RetryConfig): boolean {
  // Custom retryable check
  if (config.isRetryable) {
    return config.isRetryable(error);
  }

  // Check for network errors
  if (error instanceof TypeError) {
    // Network errors from fetch are typically TypeErrors across runtimes.
    return true;
  }

  // Check for abort errors (timeout)
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  // Check for HTTP status codes in the error
  if (error instanceof Error && 'status' in error) {
    const status = (error as Error & { status: number }).status;
    return config.retryableStatuses.includes(status);
  }

  return false;
}

/**
 * Extract Retry-After value from error if available.
 */
function extractRetryAfter(error: unknown): number | undefined {
  if (error instanceof Error && 'retryAfter' in error) {
    const retryAfter = (error as Error & { retryAfter: unknown }).retryAfter;
    if (typeof retryAfter === 'number') {
      return retryAfter;
    }
  }
  return undefined;
}

/**
 * Execute a function with retry logic.
 *
 * @param fn - The async function to execute
 * @param config - Retry configuration (partial, merged with defaults)
 * @returns RetryResult with success status, data, and attempt info
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchFromSpotify('/artists/123'),
 *   { maxRetries: 3 }
 * );
 *
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(`Failed after ${result.attempts} attempts`);
 * }
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const mergedConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  let totalDelay = 0;
  let actualAttempts = 0;

  for (let attempt = 0; attempt <= mergedConfig.maxRetries; attempt++) {
    actualAttempts = attempt + 1;
    try {
      const data = await fn();
      return {
        success: true,
        data,
        attempts: actualAttempts,
        totalDelay,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if we've exhausted retries
      if (attempt >= mergedConfig.maxRetries) {
        break;
      }

      // Don't retry if error is not retryable
      if (!isErrorRetryable(error, mergedConfig)) {
        break;
      }

      // Calculate and apply delay
      const retryAfter = extractRetryAfter(error);
      const delay = calculateDelay(attempt, mergedConfig, retryAfter);
      totalDelay += delay;

      Sentry.addBreadcrumb({
        category: 'spotify',
        message: 'Retrying request',
        level: 'info',
        data: {
          attempt: actualAttempts,
          maxRetries: mergedConfig.maxRetries,
          delay,
          error: lastError.message,
        },
      });

      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: actualAttempts,
    totalDelay,
  };
}

/**
 * Execute a function with retry logic, throwing on failure.
 *
 * @param fn - The async function to execute
 * @param config - Retry configuration (partial, merged with defaults)
 * @returns The result of the function
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * try {
 *   const data = await retryAsync(
 *     () => fetchFromSpotify('/artists/123'),
 *     { maxRetries: 3 }
 *   );
 * } catch (error) {
 *   // All retries failed
 * }
 * ```
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const result = await withRetry(fn, config);

  if (!result.success) {
    throw result.error;
  }

  return result.data!;
}

// ============================================================================
// Spotify-specific Retry Configuration
// ============================================================================

const SPOTIFY_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Default retry configuration optimized for Spotify API.
 */
export const SPOTIFY_RETRY_CONFIG: Partial<RetryConfig> = {
  maxRetries: 2, // Conservative retry count
  baseDelay: 1000, // Start with 1 second
  maxDelay: 10_000, // Cap at 10 seconds
  backoffMultiplier: 2,
  jitter: 0.2, // 20% jitter
  retryableStatuses: [...SPOTIFY_RETRYABLE_STATUSES],
  isRetryable: error => {
    // Retry on rate limit errors (message-based detection)
    if (error instanceof Error && error.message.includes('rate limit')) {
      return true;
    }

    // Retry on network errors
    if (error instanceof TypeError) {
      return true;
    }

    // Retry on timeout
    if (error instanceof DOMException && error.name === 'AbortError') {
      return true;
    }

    // Check for HTTP status codes (important: this was missing before)
    if (error instanceof Error && 'status' in error) {
      const status = (error as Error & { status: number }).status;
      return SPOTIFY_RETRYABLE_STATUSES.has(status);
    }

    return false;
  },
};
