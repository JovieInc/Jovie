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
  if (typeof window === 'undefined') return null;
  return window as AnalyticsWindow;
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
  useFeatureGate as useFeatureFlag,
  useFeatureGateWithLoading as useFeatureFlagWithLoading,
} from '@/lib/feature-flags/client';
export type { FeatureFlagKey as FeatureFlagName } from '@/lib/feature-flags/shared';
export { FEATURE_FLAG_KEYS as FEATURE_FLAGS } from '@/lib/feature-flags/shared';

// Lightweight helper for non-hook contexts
export function isFeatureEnabled(_flag: string): boolean {
  void _flag;
  // This is a static helper - use hooks in components
  return false;
}
