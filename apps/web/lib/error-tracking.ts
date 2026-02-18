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

/**
 * Get current environment tag
 */
function getEnvironment(): string {
  if (typeof window !== 'undefined') {
    const host = globalThis.location?.hostname;
    if (!host) return nodeEnv || 'development';
    if (host === 'localhost' || host === '127.0.0.1') return 'development';
    if (host.includes('preview') || host.includes('vercel.app'))
      return 'preview';
    return 'production';
  }
  return nodeEnv || 'production';
}

/**
 * Log error to console based on severity
 */
function logToConsole(
  severity: ErrorSeverity,
  message: string,
  data: Record<string, unknown>
): void {
  // Stringify data inline because Next.js RSC console forwarding
  // serialises object arguments as `{}`, losing all context.
  let serialised: string;
  try {
    serialised = JSON.stringify(data, null, 2);
  } catch {
    serialised = String(data);
  }
  const consoleMessage = `[${severity.toUpperCase()}] ${message} ${serialised}`;

  if (severity === 'warning') {
    console.warn(consoleMessage);
  } else {
    console.error(consoleMessage);
  }
}

/**
 * Send error to Sentry if initialized
 */
function sendToSentry(params: {
  error: unknown;
  errorMessage: string;
  message: string;
  severity: ErrorSeverity;
  sentryMode: SentryMode;
  environment: string;
  context?: ErrorContext;
}): void {
  const {
    error,
    errorMessage,
    message,
    severity,
    sentryMode,
    environment,
    context,
  } = params;

  if (!isSentryInitialized()) {
    console.warn(
      '[Error Tracking] Sentry not initialized, error will only be logged to console and PostHog:',
      {
        message,
        errorType: error instanceof Error ? error.name : 'UnknownError',
        sentryMode,
      }
    );
    return;
  }

  try {
    const errorInstance =
      error instanceof Error ? error : new Error(errorMessage);

    const tags: Record<string, string> = {
      severity,
      environment,
      sentryMode,
    };

    if (context?.route) {
      tags.route =
        typeof context.route === 'object'
          ? (() => {
              try {
                return JSON.stringify(context.route);
              } catch {
                return '[unserializable route]';
              }
            })()
          : String(context.route);
    }

    Sentry.captureException(errorInstance, {
      extra: {
        message,
        sentryMode,
        ...context,
      },
      level: severity === 'critical' ? 'fatal' : severity,
      tags,
    });
  } catch (sentryError) {
    console.warn('[Error Tracking] Failed to send to Sentry:', sentryError);
  }
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
  const environment = getEnvironment();

  // Always log to console for debugging
  logToConsole(severity, message, {
    ...errorData,
    ...context,
    sentryMode,
  });

  // Send to Sentry for error tracking (primary)
  sendToSentry({
    error,
    errorMessage: errorData.message,
    message,
    severity,
    sentryMode,
    environment,
    context,
  });

  // Send to PostHog for monitoring (secondary, fire-and-forget)
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
      sentry_mode: sentryMode,
      sentry_initialized: isSentryInitialized(),
      ...context,
    },
    context?.userId as string | undefined
  ).catch(trackingError => {
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
