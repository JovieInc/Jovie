/**
 * Error Tracking Utility
 *
 * Provides structured error logging with Sentry integration for production monitoring.
 * Uses Sentry as the primary error tracking service with PostHog as a secondary sink.
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

type ErrorSeverity = 'error' | 'critical' | 'warning';
type ErrorContext = Record<string, unknown>;

interface ErrorMetadata {
  severity: ErrorSeverity;
  context?: ErrorContext;
  timestamp: string;
  environment: string;
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
  return process.env.NODE_ENV || 'production';
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
 * - Sends error to Sentry for error tracking
 * - Sends error event to PostHog for monitoring
 * - Never throws (safe to use in catch blocks)
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
  const metadata: ErrorMetadata = {
    severity,
    context: context || {},
    timestamp: new Date().toISOString(),
    environment: getEnvironment(),
  };

  // Always log to console for debugging
  const consoleMessage = `[${severity.toUpperCase()}] ${message}`;
  const consoleData = {
    ...errorData,
    ...metadata.context,
  };

  if (severity === 'critical') {
    console.error(consoleMessage, consoleData);
  } else if (severity === 'warning') {
    console.warn(consoleMessage, consoleData);
  } else {
    console.error(consoleMessage, consoleData);
  }

  // Send to Sentry for error tracking (primary)
  try {
    const errorInstance =
      error instanceof Error ? error : new Error(errorData.message);

    Sentry.captureException(errorInstance, {
      extra: {
        message,
        ...metadata.context,
      },
      level: severity === 'critical' ? 'fatal' : severity,
      tags: {
        severity,
        environment: metadata.environment,
        ...(context?.route ? { route: String(context.route) } : {}),
      },
    });
  } catch (sentryError) {
    console.warn('[Error Tracking] Failed to send to Sentry:', sentryError);
  }

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
