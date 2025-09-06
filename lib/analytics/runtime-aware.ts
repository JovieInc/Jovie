/**
 * Runtime-aware analytics implementation
 * This module provides analytics tracking that works in both Node.js and Edge runtime
 */

import { ANALYTICS } from '@/constants/app';

// Type definitions for analytics functions
type AnalyticsEvent = {
  event: string;
  properties?: Record<string, unknown>;
  distinctId?: string;
};

type AnalyticsIdentify = {
  distinctId: string;
  properties?: Record<string, unknown>;
};

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
    const runtime = getRuntime();

    // Add runtime information to properties
    const eventProperties = {
      ...(properties || {}),
      runtime,
      server_side: true,
    };

    // Log in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analytics ${runtime}] ${event}`, eventProperties);
    }

    // Always use fetch-based capture to avoid bundling node-only deps
    await trackWithFetch({ event, properties: eventProperties, distinctId });
  } catch (error) {
    // Log error but don't throw - analytics should never break the application
    console.error('[Analytics] Error tracking event:', error);
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

    // Always use fetch-based identify to avoid bundling node-only deps
    await identifyWithFetch({ distinctId, properties: userProperties });
  } catch (error) {
    console.error('[Analytics] Error identifying user:', error);
  }
}

/**
 * Track event using PostHog Node.js SDK (Node.js runtime only)
 */
// Removed Node SDK usage to avoid Edge build issues

/**
 * Track event using fetch API (Edge runtime compatible)
 */
async function trackWithFetch({
  event,
  properties,
  distinctId,
}: AnalyticsEvent): Promise<void> {
  if (!ANALYTICS.posthogKey) return;

  try {
    const host = ANALYTICS.posthogHost || 'https://us.posthog.com';
    const response = await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: ANALYTICS.posthogKey,
        event,
        properties,
        distinct_id: distinctId || 'anonymous',
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error('[Analytics] Fetch API error:', error);
  }
}

/**
 * Identify user using fetch API (Edge runtime compatible)
 */
async function identifyWithFetch({
  distinctId,
  properties,
}: AnalyticsIdentify): Promise<void> {
  if (!ANALYTICS.posthogKey) return;

  try {
    const host = ANALYTICS.posthogHost || 'https://us.posthog.com';
    const response = await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: ANALYTICS.posthogKey,
        event: '$identify',
        properties: {
          $set: properties,
        },
        distinct_id: distinctId,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error('[Analytics] Fetch API identify error:', error);
  }
}

// Re-export with consistent naming for backward compatibility
export const trackServerEvent = trackEvent;
export const identifyServerUser = identifyUser;
