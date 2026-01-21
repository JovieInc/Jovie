/**
 * Server-side analytics implementation
 * Delegates to the runtime-aware analytics helpers.
 */

import { identifyUser, trackEvent } from '@/lib/analytics/runtime-aware';

export async function trackServerEvent(
  event: string,
  properties?: Record<string, unknown>,
  distinctId?: string
) {
  await trackEvent(event, properties, distinctId);
}

export async function identifyServerUser(
  distinctId: string,
  properties?: Record<string, unknown>
) {
  await identifyUser(distinctId, properties);
}

export async function flushServerAnalytics() {
  // No-op: runtime-aware analytics do not buffer events.
}

export async function shutdownServerAnalytics() {
  // No-op: runtime-aware analytics do not maintain a long-lived client.
}
