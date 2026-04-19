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

export function track(event: string, properties?: Record<string, unknown>) {
  const analyticsWindow = getAnalyticsWindow();
  if (!analyticsWindow?.gtag) return;

  const envTag = getEnvTag(analyticsWindow.location.hostname);

  analyticsWindow.gtag('event', event, {
    ...properties,
    env: envTag,
  });
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
  if (globalThis.window !== undefined && globalThis.localStorage.getItem(key)) {
    return false;
  }

  track('magic_moment_achieved', {
    timeToMagicMoment: Date.now() - params.signupTimestamp,
    hasAvatar: params.hasAvatar,
    hasDisplayName: params.hasDisplayName,
    dspLinkCount: params.dspLinkCount,
    releaseCount: params.releaseCount,
    enrichmentStatus: params.enrichmentStatus,
  });

  if (globalThis.window !== undefined) {
    globalThis.localStorage.setItem(key, String(Date.now()));
  }

  return true;
}

// Lightweight helper for non-hook contexts
export function isFeatureEnabled(_flag: string): boolean {
  void _flag;
  // This is a static helper - use hooks in components
  return false;
}
