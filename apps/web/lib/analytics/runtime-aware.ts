/**
 * Runtime-aware analytics implementation
 * This module provides analytics tracking that works in both Node.js and Edge runtime
 */

import * as Sentry from '@sentry/nextjs';
import { createScopedLogger } from '@/lib/utils/logger';

const log = createScopedLogger('Analytics');

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
  distinctId?: string
): Promise<void> {
  try {
    void distinctId;
    const runtime = getRuntime();

    // Add runtime information to properties
    const eventProperties = {
      ...(properties || {}),
      runtime,
      server_side: true,
    };

    // Log for debugging (dev/preview only via logger environment gating)
    log.debug(`${event} (runtime: ${runtime})`, eventProperties);

    // In production, send critical events to Sentry for observability
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
    log.error('Error tracking event', { error, event });
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

    // Log for debugging (dev/preview only via logger environment gating)
    log.debug('identify', { distinctId, ...userProperties });
  } catch (error) {
    log.error('Error identifying user', { error, distinctId });
  }
}

// Re-export with consistent naming for backward compatibility
export const trackServerEvent = trackEvent;
export const identifyServerUser = identifyUser;
