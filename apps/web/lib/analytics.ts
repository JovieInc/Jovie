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
 * Outcome of a client analytics dispatch attempt. The gtag API offers no
 * delivery acknowledgement, so `dispatched` means the event was handed to
 * gtag — it is not evidence of durable delivery. Revenue-critical funnel
 * events are measured by the durable server sink (lib/server-analytics.ts);
 * this client path is supplemental telemetry only.
 */
export type TrackDispatchOutcome =
  | 'dispatched'
  | 'skipped_no_transport'
  | 'dispatch_failed';

export function track(
  event: string,
  properties?: Record<string, unknown>
): TrackDispatchOutcome {
  const analyticsWindow = getAnalyticsWindow();
  if (!analyticsWindow?.gtag) return 'skipped_no_transport';

  const envTag = getEnvTag(analyticsWindow.location.hostname);

  try {
    analyticsWindow.gtag('event', event, {
      ...properties,
      env: envTag,
    });
    return 'dispatched';
  } catch {
    return 'dispatch_failed';
  }
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
  if (globalThis.window !== undefined) {
    try {
      if (globalThis.localStorage.getItem(key)) {
        return false;
      }
    } catch {
      // Blocked/unavailable storage must not suppress the dispatch attempt.
    }
  }

  const outcome = track('magic_moment_achieved', {
    timeToMagicMoment: Date.now() - params.signupTimestamp,
    hasAvatar: params.hasAvatar,
    hasDisplayName: params.hasDisplayName,
    dspLinkCount: params.dspLinkCount,
    releaseCount: params.releaseCount,
    enrichmentStatus: params.enrichmentStatus,
  });

  // The marker records only that a dispatch was handed to gtag. A skipped or
  // failed dispatch leaves no marker so a later load can retry; gtag gives no
  // delivery acknowledgement, so invocation is never treated as proof of
  // durable delivery (that lives in the server funnel events).
  if (outcome !== 'dispatched') {
    return false;
  }

  if (globalThis.window !== undefined) {
    try {
      globalThis.localStorage.setItem(key, String(Date.now()));
    } catch {
      // Storage exceptions (private mode, quota) must not break onboarding.
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
