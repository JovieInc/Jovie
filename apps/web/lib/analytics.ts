'use client';

import { env } from '@/lib/env-client';
import { publicEnv } from '@/lib/env-public';

type AnalyticsWindow = Window & {
  gtag?: (
    command: string,
    event: string,
    properties?: Record<string, unknown>
  ) => void;
};

function getAnalyticsWindow(): AnalyticsWindow | null {
  if (globalThis.window === undefined) return null;
  return globalThis.window as AnalyticsWindow;
}

function getEnvTag(host: string): 'dev' | 'prod' | 'preview' {
  try {
    const prodHost = new URL(publicEnv.NEXT_PUBLIC_APP_URL).hostname;
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.local')
    ) {
      return 'dev';
    }
    if (host === prodHost || host === `www.${prodHost}`) {
      return 'prod';
    }
    return 'preview';
  } catch {
    return env.IS_DEV ? 'dev' : 'prod';
  }
}

/**
 * Client GA4 dispatch. Returns whether the event was actually handed to gtag.
 * JOV-6459: a false return means the event was NOT delivered (no gtag yet —
 * ad blocker, denied consent, or a late loader). Callers must treat a false
 * return as "not delivered" and must never record delivered/bookkeeping
 * markers for an event that was skipped. Client telemetry is supplemental;
 * revenue-critical transitions are persisted by the server event sink.
 */
export function track(
  event: string,
  properties?: Record<string, unknown>
): boolean {
  const analyticsWindow = getAnalyticsWindow();
  if (!analyticsWindow?.gtag) return false;

  const envTag = getEnvTag(analyticsWindow.location.hostname);

  analyticsWindow.gtag('event', event, {
    ...properties,
    env: envTag,
  });
  return true;
}

export function page(name?: string, properties?: Record<string, unknown>) {
  void name;
  void properties;
  // Vercel Analytics handles pageviews; we just ensure the module is imported
}

export function identify(userId: string, traits?: Record<string, unknown>) {
  void userId;
  void traits;
}

// Re-export client hooks from feature-flags module
export {
  useAppFlag as useFeatureFlag,
  useAppFlagWithLoading as useFeatureFlagWithLoading,
} from '@/lib/flags/client';
export type { AppFlagName as FeatureFlagName } from '@/lib/flags/contracts';

/**
 * Track the "magic moment" — when a profile has all 4 key elements:
 * avatar + display name + at least 1 DSP link + at least 1 release.
 * Uses localStorage to ensure it fires only once per profile.
 *
 * JOV-6459 delivery contract: the localStorage marker is bookkeeping that
 * records a completed delivery, so it is written ONLY when `track()` actually
 * dispatched to gtag. When gtag is missing (ad blocker, denied consent, late
 * loader) the marker must NOT be written — otherwise a blocked dispatch would
 * permanently erase the activation evidence by claiming delivery that never
 * happened. Durable activation measurement is owned by the server event sink
 * (activation_completed); this marker is supplemental telemetry bookkeeping.
 */
export function trackMagicMomentIfReady(params: {
  profileId: string;
  hasAvatar: boolean;
  hasDisplayName: boolean;
  dspLinkCount: number;
  releaseCount: number;
  signupTimestamp: number;
  enrichmentStatus: string;
}): boolean {
  if (
    !params.hasAvatar ||
    !params.hasDisplayName ||
    params.dspLinkCount < 1 ||
    params.releaseCount < 1
  ) {
    return false;
  }

  const key = `magic_moment_achieved_${params.profileId}`;
  if (globalThis.window !== undefined && globalThis.localStorage.getItem(key)) {
    return false;
  }

  const dispatched = track('magic_moment_achieved', {
    timeToMagicMoment: Date.now() - params.signupTimestamp,
    hasAvatar: params.hasAvatar,
    hasDisplayName: params.hasDisplayName,
    dspLinkCount: params.dspLinkCount,
    releaseCount: params.releaseCount,
    enrichmentStatus: params.enrichmentStatus,
  });

  // Delivery bookkeeping only after a real dispatch. A skipped gtag call
  // leaves no marker, so a later load can retry the event.
  if (!dispatched) {
    return false;
  }

  if (globalThis.window !== undefined) {
    try {
      globalThis.localStorage.setItem(key, String(Date.now()));
    } catch {
      // Storage can be blocked (quota, privacy mode). The event was
      // delivered to gtag; a missing marker costs one extra future
      // dispatch, never a false delivered claim.
    }
  }

  return true;
}

// Lightweight helper for non-hook contexts
export function isFeatureEnabled(_flag: string): boolean {
  void _flag;
  // This is a static helper - use hooks in components
  return false;
}
