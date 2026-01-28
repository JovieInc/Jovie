/**
 * Runtime-aware analytics implementation
 * This module provides analytics tracking that works in both Node.js and Edge runtime
 *
 * NOTE: This module intentionally uses process.env.NODE_ENV directly instead of the
 * env-server module because it must work in Edge Runtime where server-only imports
 * are not allowed. NODE_ENV is inlined at build time by Next.js so this is safe.
 */

import * as Sentry from '@sentry/nextjs';

/**
 * Detect the current runtime environment
 */
function getRuntime(): 'nodejs' | 'edge' | 'unknown' {
  // Check for Edge Runtime by looking for edge-specific globals
  if (typeof globalThis !== 'undefined' && 'EdgeRuntime' in globalThis) {
    return 'edge';
  }

  // Alternative edge runtime detection
  if (
    typeof navigator !== 'undefined' &&
    navigator.userAgent?.includes('Next.js')
  ) {
    return 'edge';
  }

  // Check for Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'nodejs';
  }

  return 'unknown';
}

/**
 * Track an event using the appropriate analytics method for the current runtime
 */
export async function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
  _distinctId?: string
): Promise<void> {
  try {
    const runtime = getRuntime();

    // Add runtime information to properties
    const eventProperties = {
      ...(properties || {}),
      runtime,
      server_side: true,
    };

    // Log in development for debugging
    // NOTE: Using process.env.NODE_ENV directly for Edge Runtime compatibility
    if (process.env.NODE_ENV === 'development') {
      Sentry.addBreadcrumb({
        category: 'analytics',
        message: `[${runtime}] ${event}`,
        level: 'info',
        data: eventProperties,
      });
    }

    // In production, send critical events to Sentry for observability
    // NOTE: Using process.env.NODE_ENV directly for Edge Runtime compatibility
    if (
      process.env.NODE_ENV === 'production' &&
      (event.startsWith('$exception') || event.startsWith('error'))
    ) {
      Sentry.addBreadcrumb({
        category: 'analytics',
        message: event,
        data: eventProperties,
        level: event.includes('critical') ? 'fatal' : 'error',
      });
    }
  } catch (error) {
    // Log error but don't throw - analytics should never break the application
    Sentry.captureException(error, {
      tags: { context: 'analytics_tracking' },
      extra: { event, properties },
    });
  }
}

/**
 * Identify a user using the appropriate method for the current runtime
 */
export async function identifyUser(
  distinctId: string,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    const runtime = getRuntime();

    const userProperties = {
      ...(properties || {}),
      runtime,
      server_side: true,
    };

    // NOTE: Using process.env.NODE_ENV directly for Edge Runtime compatibility
    if (process.env.NODE_ENV === 'development') {
      Sentry.addBreadcrumb({
        category: 'analytics',
        message: `identify: ${distinctId}`,
        level: 'info',
        data: userProperties,
      });
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { context: 'analytics_identify' },
      extra: { distinctId, properties },
    });
  }
}

// Re-export with consistent naming for backward compatibility
export const trackServerEvent = trackEvent;
export const identifyServerUser = identifyUser;
