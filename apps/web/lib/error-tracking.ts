/**
 * Error Tracking Utility
 *
 * Provides structured error logging with Sentry integration for production monitoring.
 * Uses Sentry as the primary error tracking service with PostHog as a secondary sink.
 *
 * SDK Variant Awareness:
 * This module works with both lite and full Sentry SDK variants:
 * - Checks SDK initialization state before capturing errors
 * - Includes SDK mode (lite/full) in error tags for dashboard filtering
 * - Provides graceful fallbacks when SDK is not initialized
 *
 * Usage:
 *   import { captureError, captureCriticalError } from '@/lib/error-tracking'
 *
 *   try {
 *     // revenue-critical code
 *   } catch (error) {
 *     captureCriticalError('Stripe webhook failed', error, {
 *       subscriptionId: subscription.id,
 *       userId: userId
 *     })
 *   }
 */

import * as Sentry from '@sentry/nextjs';
import { trackEvent } from '@/lib/analytics/runtime-aware';
import {
  getSentryMode,
  isSentryInitialized,
  type SentryMode,
} from '@/lib/sentry/init';

// NOTE: This module is used in both server and client contexts, so we read
// NODE_ENV directly from process.env rather than importing from env-server.ts
// which has 'server-only' protection.
const nodeEnv = process.env.NODE_ENV ?? 'development';

type ErrorSeverity = 'error' | 'critical' | 'warning';
type ErrorContext = Record<string, unknown>;

interface ErrorMetadata {
  severity: ErrorSeverity;
  context?: ErrorContext;
  timestamp: string;
  environment: string;
  sentryMode: SentryMode;
}

/**
 * Get current environment tag
 */
function getEnvironment(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'development';
    if (host.includes('preview') || host.includes('vercel.app'))
      return 'preview';
    return 'production';
  }
  return nodeEnv || 'production';
}

/**
 * Format error for logging and tracking
 */
function formatError(error: unknown): {
  message: string;
  stack?: string;
  type: string;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      type: error.name,
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      type: 'StringError',
    };
  }

  return {
    message: JSON.stringify(error),
    type: 'UnknownError',
  };
}

/**
 * Capture an error and send to Sentry and PostHog
 *
 * This function:
 * - Logs to console for debugging
 * - Sends error to Sentry for error tracking (if SDK is initialized)
 * - Sends error event to PostHog for monitoring
 * - Never throws (safe to use in catch blocks)
 *
 * SDK Variant Awareness:
 * - Checks if Sentry is initialized before attempting capture
 * - Works with both lite and full SDK modes
 * - Includes SDK mode in tags for filtering in Sentry dashboard
 * - Provides graceful fallback logging when SDK is not ready
 *
 * @param message - Human-readable error description
 * @param error - The error object or error message
 * @param context - Additional context (userId, route, etc.)
 * @param severity - Error severity level (default: 'error')
 */
export async function captureError(
  message: string,
  error: unknown,
  context?: ErrorContext,
  severity: ErrorSeverity = 'error'
): Promise<void> {
  const errorData = formatError(error);
  const sentryMode = getSentryMode();
  const isInitialized = isSentryInitialized();

  const metadata: ErrorMetadata = {
    severity,
    context: context || {},
    timestamp: new Date().toISOString(),
    environment: getEnvironment(),
    sentryMode,
  };

  // Always log to console for debugging
  const consoleMessage = `[${severity.toUpperCase()}] ${message}`;
  const consoleData = {
    ...errorData,
    ...metadata.context,
    sentryMode, // Include SDK mode in console logs for debugging
  };

  if (severity === 'critical') {
    console.error(consoleMessage, consoleData);
  } else if (severity === 'warning') {
    console.warn(consoleMessage, consoleData);
  } else {
    console.error(consoleMessage, consoleData);
  }

  // Send to Sentry for error tracking (primary)
  // Check if SDK is initialized before attempting capture
  if (isInitialized) {
    try {
      const errorInstance =
        error instanceof Error ? error : new Error(errorData.message);

      Sentry.captureException(errorInstance, {
        extra: {
          message,
          sentryMode, // Include SDK mode in extra for debugging
          ...metadata.context,
        },
        level: severity === 'critical' ? 'fatal' : severity,
        tags: {
          severity,
          environment: metadata.environment,
          sentryMode, // Tag to filter by SDK variant in Sentry dashboard
          ...(context?.route ? { route: String(context.route) } : {}),
        },
      });
    } catch (sentryError) {
      // Sentry capture failed - this should be rare but provides resilience
      console.warn('[Error Tracking] Failed to send to Sentry:', sentryError);
    }
  } else {
    // Sentry not initialized - log for debugging
    // This can happen during initial load before SDK is ready, or on pages
    // where Sentry hasn't been loaded yet
    console.warn(
      '[Error Tracking] Sentry not initialized, error will only be logged to console and PostHog:',
      { message, errorType: errorData.type, sentryMode }
    );
  }

  // Send to PostHog for monitoring (secondary, fire-and-forget)
  // PostHog serves as a backup when Sentry is not initialized
  const eventName =
    severity === 'critical' ? '$exception_critical' : '$exception';

  trackEvent(
    eventName,
    {
      error_message: message,
      error_type: errorData.type,
      error_stack: errorData.stack,
      error_severity: severity,
      error_raw_message: errorData.message,
      sentry_mode: sentryMode, // Include SDK mode in PostHog events
      sentry_initialized: isInitialized,
      ...metadata.context,
    },
    context?.userId as string | undefined
  ).catch(trackingError => {
    // Never let error tracking break the app
    console.warn('[Error Tracking] Failed to send to PostHog:', trackingError);
  });
}

/**
 * Capture a critical error (revenue-impacting, requires immediate attention)
 *
 * Use this for:
 * - Stripe webhook failures
 * - Payment processing errors
 * - Data corruption
 * - Security violations
 *
 * @param message - Human-readable error description
 * @param error - The error object or error message
 * @param context - Additional context (userId, subscriptionId, etc.)
 */
export async function captureCriticalError(
  message: string,
  error: unknown,
  context?: ErrorContext
): Promise<void> {
  return captureError(message, error, context, 'critical');
}

/**
 * Capture a warning (non-critical issue that should be monitored)
 *
 * Use this for:
 * - Fallback logic execution
 * - Deprecated API usage
 * - Performance issues
 * - Data validation warnings
 *
 * @param message - Human-readable warning description
 * @param error - The error object or error message (optional)
 * @param context - Additional context
 */
export async function captureWarning(
  message: string,
  error?: unknown,
  context?: ErrorContext
): Promise<void> {
  return captureError(message, error || message, context, 'warning');
}

/**
 * Log fallback logic execution (helps identify when metadata is missing)
 *
 * @param message - Fallback action description
 * @param context - Context about the fallback
 */
export async function logFallback(
  message: string,
  context: ErrorContext
): Promise<void> {
  console.warn(`[FALLBACK] ${message}`, context);

  try {
    await trackEvent(
      'fallback_executed',
      {
        fallback_message: message,
        ...context,
      },
      context.userId as string | undefined
    );
  } catch {
    // Silent fail
  }
}

/**
 * Sanitize error response for client consumption.
 *
 * In production, this strips internal details (stack traces, DB errors, etc.)
 * and returns only a safe, user-friendly message.
 *
 * In development, debug info is preserved for easier debugging.
 *
 * @param userMessage - Safe message to show users
 * @param debugInfo - Internal details (only shown in dev)
 * @param options - Additional options
 * @returns Sanitized error response object
 */
export function sanitizeErrorResponse(
  userMessage: string,
  debugInfo?: string | Record<string, unknown>,
  options?: {
    code?: string;
    includeDebugInDev?: boolean;
  }
): { error: string; code?: string; debug?: string | Record<string, unknown> } {
  const isDev = nodeEnv === 'development';
  const includeDebug = options?.includeDebugInDev ?? true;

  const response: {
    error: string;
    code?: string;
    debug?: string | Record<string, unknown>;
  } = {
    error: userMessage,
  };

  if (options?.code) {
    response.code = options.code;
  }

  // Only include debug info in development
  if (isDev && includeDebug && debugInfo) {
    response.debug = debugInfo;
  }

  return response;
}

/**
 * Extract a safe error message from an unknown error.
 *
 * Never exposes internal error details to users in production.
 * Returns a generic message for unknown errors.
 *
 * @param error - The caught error
 * @param fallbackMessage - Message to use if error is not an Error instance
 * @returns Safe error message string
 */
export function getSafeErrorMessage(
  error: unknown,
  fallbackMessage = 'An unexpected error occurred'
): string {
  // In production, always return the fallback for security
  if (nodeEnv === 'production') {
    return fallbackMessage;
  }

  // In development, provide more detail for debugging
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return fallbackMessage;
}

/**
 * Get the current Sentry SDK status for debugging or conditional behavior.
 *
 * @returns Object with SDK initialization state
 *
 * @example
 * const { isReady, mode } = getSentryStatus();
 * if (isReady) {
 *   console.log(`Sentry initialized in ${mode} mode`);
 * }
 */
export function getSentryStatus(): {
  isReady: boolean;
  mode: SentryMode;
} {
  return {
    isReady: isSentryInitialized(),
    mode: getSentryMode(),
  };
}

// Re-export SDK mode utilities for consumers who need more control
export { getSentryMode, isSentryInitialized, type SentryMode };
