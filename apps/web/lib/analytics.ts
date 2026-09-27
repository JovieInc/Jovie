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
 * Attempt a GA4 dispatch. Returns true only when `window.gtag` was actually
 * invoked. GA4 offers no delivery acknowledgement, so `true` means "the tag
 * accepted the call", never proof the event was persisted or delivered — the
 * durable source of truth for revenue-critical transitions is the server
 * analytics ledger (`trackServerEvent`).
 */
function dispatchGtagEvent(
  event: string,
  properties?: Record<string, unknown>
): boolean {
  const analyticsWindow = getAnalyticsWindow();
  if (!analyticsWindow?.gtag) return false;

  const envTag = getEnvTag(analyticsWindow.location.hostname);

  try {
    analyticsWindow.gtag('event', event, {
      ...properties,
      env: envTag,
    });
    return true;
  } catch {
    return false;
  }
}

export function track(event: string, properties?: Record<string, unknown>) {
  dispatchGtagEvent(event, properties);
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

function readDispatchMarker(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) != null;
  } catch {
    // Blocked/throwing storage is treated as "no marker" so a later
    // successful dispatch still fires. Never throws.
    return false;
  }
}

function writeDispatchMarker(key: string): void {
  try {
    globalThis.localStorage?.setItem(key, String(Date.now()));
  } catch {
    // Storage failures are non-fatal and never block the user action.
  }
}

/**
 * Supplemental client telemetry for the "magic moment" — when a profile has
 * all 4 key elements: avatar + display name + at least 1 DSP link + at least
 * 1 release.
 *
 * The localStorage entry is a dispatch marker, not a delivery receipt: it is
 * written only after `window.gtag` was actually invoked, and GA4 provides no
 * delivery acknowledgement, so it can never prove durable delivery. The
 * canonical activation evidence is the server-side `onboarding_completed`
 * event keyed by profile id (see `recordOnboardingCompletedReceipt`), which
 * fires regardless of ad blockers, consent state, or storage availability.
 *
 * Returns true only when the GA4 dispatch was attempted this call. A skipped
 * dispatch (missing/blocked gtag, late loader) returns false and leaves the
 * marker unset so a later load can still record the telemetry point.
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
  if (globalThis.window !== undefined && readDispatchMarker(key)) {
    return false;
  }

  const dispatched = dispatchGtagEvent('magic_moment_achieved', {
    timeToMagicMoment: Date.now() - params.signupTimestamp,
    hasAvatar: params.hasAvatar,
    hasDisplayName: params.hasDisplayName,
    dspLinkCount: params.dspLinkCount,
    releaseCount: params.releaseCount,
    enrichmentStatus: params.enrichmentStatus,
  });

  // Only mark dispatch after a real invocation — never after a skipped or
  // failed dispatch, which would permanently erase the telemetry attempt.
  if (!dispatched) return false;

  writeDispatchMarker(key);
  return true;
}

// Lightweight helper for non-hook contexts
export function isFeatureEnabled(_flag: string): boolean {
  void _flag;
  // This is a static helper - use hooks in components
  return false;
}
