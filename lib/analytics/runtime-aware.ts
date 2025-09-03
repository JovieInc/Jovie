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

    if (runtime === 'nodejs') {
      // Use PostHog Node.js SDK for Node.js runtime
      await trackWithPostHogNode({
        event,
        properties: eventProperties,
        distinctId,
      });
    } else if (runtime === 'edge') {
      // Use fetch-based approach for Edge runtime
      await trackWithFetch({ event, properties: eventProperties, distinctId });
    } else {
      // Fallback for unknown runtime
      console.warn(`[Analytics] Unknown runtime, skipping event: ${event}`);
    }
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

    if (runtime === 'nodejs') {
      await identifyWithPostHogNode({ distinctId, properties: userProperties });
    } else if (runtime === 'edge') {
      await identifyWithFetch({ distinctId, properties: userProperties });
    } else {
      console.warn(
        `[Analytics] Unknown runtime, skipping identify: ${distinctId}`
      );
    }
  } catch (error) {
    console.error('[Analytics] Error identifying user:', error);
  }
}

/**
 * Track event using PostHog Node.js SDK (Node.js runtime only)
 */
async function trackWithPostHogNode({
  event,
  properties,
  distinctId,
}: AnalyticsEvent): Promise<void> {
  if (!ANALYTICS.posthogKey) return;

  try {
    // Only import PostHog in Node.js runtime to avoid bundling issues
    const PostHogModule = await import('posthog-node');
    const { PostHog } = PostHogModule;

    const client = new PostHog(ANALYTICS.posthogKey, {
      host: ANALYTICS.posthogHost || 'https://us.posthog.com',
      flushAt: 1,
      flushInterval: 1000,
    });

    await client.capture({
      distinctId: distinctId || 'anonymous',
      event,
      properties,
    });

    await client.shutdown();
  } catch (error) {
    console.error('[Analytics] PostHog Node.js error:', error);
  }
}

/**
 * Identify user using PostHog Node.js SDK (Node.js runtime only)
 */
async function identifyWithPostHogNode({
  distinctId,
  properties,
}: AnalyticsIdentify): Promise<void> {
  if (!ANALYTICS.posthogKey) return;

  try {
    const PostHogModule = await import('posthog-node');
    const { PostHog } = PostHogModule;

    const client = new PostHog(ANALYTICS.posthogKey, {
      host: ANALYTICS.posthogHost || 'https://us.posthog.com',
      flushAt: 1,
      flushInterval: 1000,
    });

    await client.identify({
      distinctId,
      properties,
    });

    await client.shutdown();
  } catch (error) {
    console.error('[Analytics] PostHog Node.js identify error:', error);
  }
}

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
